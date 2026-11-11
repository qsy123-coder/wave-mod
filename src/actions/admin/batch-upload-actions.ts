"use server";

import { revalidatePath } from "next/cache";

import type {
  BatchDriveLink,
  BatchUploadInputRow,
  BatchUploadResult,
} from "@/lib/admin/batch-upload-types";
import { batchUploadSchema } from "@/lib/admin/batch-upload-schema";
import { xxmiInstallGuideText } from "@/lib/constants/install-guide";
import { queryRows, withTransaction } from "@/lib/db/query";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { logger } from "@/lib/logger";

import { dedupKey } from "../../../scripts/daily-classify.mjs";

const GAME_KEY = "wuthering-waves";
const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

type ExistingModRow = {
  id: string;
  character: string;
  title: string;
  created_at: string;
};

function emptyResult(error?: string): BatchUploadResult {
  return { ok: !error, error, inserted: 0, updated: 0, reshelved: 0, duplicates: 0, failed: [] };
}

/** 所选日期中午（上海时区）→ ISO，语义与每日上传脚本的 created_at 完全一致 */
function noonShanghaiISO(date: string): string | null {
  const value = new Date(`${date}T12:00:00+08:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function mergeDriveLinks(a: BatchDriveLink[], b: BatchDriveLink[]): BatchDriveLink[] {
  // 同一平台在不同变体下是两个不同分享，不能按平台直接覆盖
  const bySlot = new Map<string, BatchDriveLink>();
  for (const link of [...a, ...b]) bySlot.set(`${link.variant ?? ""}|${link.platform}`, link);
  return [...bySlot.values()];
}

export async function batchUploadModsAction(input: unknown): Promise<BatchUploadResult> {
  const parsed = batchUploadSchema.safeParse(input);

  if (!parsed.success) {
    return emptyResult(parsed.error.issues[0]?.message ?? "提交数据无效");
  }

  const createdAt = noonShanghaiISO(parsed.data.date);

  if (!createdAt) {
    return emptyResult("日期不是合法的 YYYY-MM-DD");
  }

  try {
    const [characterRows, existingRows] = await Promise.all([
      queryRows<{ character: string }>(
        "select distinct character from public.mods where character is not null",
      ),
      queryRows<ExistingModRow>(
        "select id, character, title, created_at from public.mods",
      ),
    ]);

    const allowedCharacters = new Set(characterRows.map((row) => row.character));
    const existingByKey = new Map(
      existingRows.map((row) => [dedupKey(row.character, row.title), row]),
    );

    const unknownCharacters = parsed.data.rows
      .filter((row) => !allowedCharacters.has(row.character))
      .map((row) => `${row.character}（${row.title}）`);

    if (unknownCharacters.length > 0) {
      return {
        ...emptyResult(),
        ok: false,
        error: `以下角色不在站内分类中，请先修正：${unknownCharacters.slice(0, 5).join("、")}${unknownCharacters.length > 5 ? "…" : ""}`,
      };
    }

    // 批内去重：同一 character|title 合并网盘/图片，后出现的值覆盖前者
    const merged = new Map<string, BatchUploadInputRow>();
    let duplicates = 0;

    for (const row of parsed.data.rows) {
      const key = dedupKey(row.character, row.title);
      const previous = merged.get(key);

      if (!previous) {
        merged.set(key, { ...row });
        continue;
      }

      duplicates++;
      merged.set(key, {
        ...previous,
        ...row,
        driveLinks: mergeDriveLinks(previous.driveLinks, row.driveLinks),
        images: [...new Set([...previous.images, ...row.images])],
        editedFields: [...new Set([...previous.editedFields, ...row.editedFields])],
      });
    }

    let inserted = 0;
    let updated = 0;
    let reshelved = 0;

    await withTransaction(async (client) => {
      for (const [key, row] of merged) {
        const existing = existingByKey.get(key);
        const images = row.images.length > 0 ? row.images : [PLACEHOLDER_IMAGE_URL];
        const edited = new Set(row.editedFields);
        const nextCreatedAt = createdAt;

        if (existing) {
          const isLater = new Date(existing.created_at).getTime() < new Date(nextCreatedAt).getTime();

          await client.query(
            `update public.mods set
               drive_links = $1::jsonb,
               images = case when cardinality($2::text[]) > 0 then $2::text[] else images end,
               created_at = case when created_at < $3::timestamptz then $3::timestamptz else created_at end,
               updated_at = now(),
               description = case when $4::boolean then $5 else description end,
               version = case when $6::boolean then $7 else version end,
               game_version = case when $8::boolean then $9 else game_version end,
               nsfw = case when $10::boolean then $11 else nsfw end
             where id = $12`,
            [
              JSON.stringify(row.driveLinks),
              images,
              nextCreatedAt,
              edited.has("description"),
              row.description,
              edited.has("version"),
              row.version,
              edited.has("gameVersion"),
              row.gameVersion,
              edited.has("nsfw"),
              row.nsfw,
              existing.id,
            ],
          );

          updated++;
          if (isLater) reshelved++;
        } else {
          await client.query(
            `insert into public.mods
               (title, character, version, game_version, description, images, drive_links,
                nsfw, xxmi_install_guide, game_key, is_published, is_available, created_at)
             values ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, $8, $9, $10, true, true, $11)`,
            [
              row.title,
              row.character,
              row.version,
              row.gameVersion,
              row.description,
              images,
              JSON.stringify(row.driveLinks),
              row.nsfw,
              xxmiInstallGuideText,
              GAME_KEY,
              nextCreatedAt,
            ],
          );
          inserted++;
        }
      }
    });

    revalidatePublicModCaches();
    revalidatePath("/admin/mods");
    revalidatePath("/admin/batch-upload");

    logger.info("[admin] batchUploadMods completed", {
      inserted,
      updated,
      reshelved,
      duplicates,
    });

    return { ok: true, inserted, updated, reshelved, duplicates, failed: [] };
  } catch (error) {
    logger.error("[admin] batchUploadMods failed", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return emptyResult(
      `写入失败（已回滚）：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }
}
