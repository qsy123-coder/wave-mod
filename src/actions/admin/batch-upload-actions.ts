"use server";

import { revalidatePath } from "next/cache";

import type {
  BatchDriveLink,
  BatchUploadInputRow,
  BatchUploadResult,
} from "@/lib/admin/batch-upload-types";
import {
  hasRealImages,
  shouldUpdateVariantImages,
} from "@/lib/admin/batch-upload-merge";
import { batchUploadSchema } from "@/lib/admin/batch-upload-schema";
import { xxmiInstallGuideText } from "@/lib/constants/install-guide";
import { queryRows, withTransaction } from "@/lib/db/query";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { logger } from "@/lib/logger";
import { getCharacterAllowlist } from "@/lib/mods-domain/public";

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
    const [allowedCharacterList, existingRows] = await Promise.all([
      // 与页面同一个口径：库内 distinct ∪ 站内已登记角色。原来只取 distinct，
      // 会让新角色的第一条 mod 在服务端被拒（前端放过也没用）。
      getCharacterAllowlist(GAME_KEY),
      queryRows<ExistingModRow>(
        "select id, character, title, created_at from public.mods",
      ),
    ]);

    const allowedCharacters = new Set(allowedCharacterList);
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
      const variantImages: Record<string, string[]> = { ...previous.variantImages };
      for (const [label, urls] of Object.entries(row.variantImages ?? {})) {
        variantImages[label] = [...new Set([...(variantImages[label] ?? []), ...urls])];
      }
      merged.set(key, {
        ...previous,
        ...row,
        driveLinks: mergeDriveLinks(previous.driveLinks, row.driveLinks),
        images: [...new Set([...previous.images, ...row.images])],
        variantImages,
        editedFields: [...new Set([...previous.editedFields, ...row.editedFields])],
      });
    }

    let inserted = 0;
    let updated = 0;
    let reshelved = 0;

    await withTransaction(async (client) => {
      for (const [key, row] of merged) {
        const existing = existingByKey.get(key);
        // 空数组**必须先保留为空**再进分支：更新时它代表「用户没选新图，别动库里的图」，
        // 一旦提前补成占位图，`hasRealImages()` 就会判成「有图」。新建那条路径才补占位图。
        const images = row.images;
        const variantImages = row.variantImages ?? {};
        const edited = new Set(row.editedFields);
        const nextCreatedAt = createdAt;

        if (existing) {
          const isLater = new Date(existing.created_at).getTime() < new Date(nextCreatedAt).getTime();

          /**
           * ── 覆盖更新的三条硬规则（2026-11-13 修的数据丢失 bug）───────────
           *
           * 1. `drive_links` **按平台合并**，不是整体替换。原来的 `= $1::jsonb` 会让
           *    本次 CSV 没提供的平台（迅雷 / 百度）链接**全部消失** —— 实测跑一次
           *    覆盖更新就把迅雷链接丢了。合并用 SQL 的 jsonb 数组做：旧链接里
           *    本次没提供的 `variant|platform` 组合键原样保留，其余用新值覆盖。
           *    规则与 `batch-upload-merge.ts` 的 mergeDriveLinksByPlatform 一致，
           *    那边有单测；这里因为要按行取旧值，只能写成 SQL。
           *
           * 2. `images` 只在**真有新图**时才覆盖。判据不能是 `cardinality(...) > 0`：
           *    前端没选图时会塞 `[占位图]`，长度也是 1，于是恒为真、把库里真图全换成
           *    占位图。现在由 `hasRealImages()` 在调用前算好 `updateImages` 布尔值。
           *
           * 3. `variant_images` 同理，空对象或只有占位图时保留原值。
           */
          const updateImages = hasRealImages(images);
          const updateVariantImages = shouldUpdateVariantImages(variantImages);

          await client.query(
            `update public.mods m set
               drive_links = (
                 select coalesce(jsonb_agg(link), '[]'::jsonb)
                 from (
                   -- 旧链接里、本次没提供的 variant|platform 组合键原样保留
                   select link
                   from jsonb_array_elements(coalesce(m.drive_links, '[]'::jsonb)) as old(link)
                   where not exists (
                     select 1
                     from jsonb_array_elements($1::jsonb) as inc(value)
                     where coalesce(inc.value->>'variant', '') = coalesce(old.link->>'variant', '')
                       and inc.value->>'platform' = old.link->>'platform'
                   )
                   union all
                   -- 本次提供的链接覆盖旧值
                   select value from jsonb_array_elements($1::jsonb) as inc(value)
                 ) merged
               ),
               images = case when $2::boolean then $3::text[] else m.images end,
               variant_images = case when $4::boolean then $5::jsonb else m.variant_images end,
               created_at = case when m.created_at < $6::timestamptz then $6::timestamptz else m.created_at end,
               updated_at = now(),
               description = case when $7::boolean then $8 else m.description end,
               version = case when $9::boolean then $10 else m.version end,
               game_version = case when $11::boolean then $12 else m.game_version end,
               nsfw = case when $13::boolean then $14 else m.nsfw end
             where m.id = $15`,
            [
              JSON.stringify(row.driveLinks),
              updateImages,
              images,
              updateVariantImages,
              JSON.stringify(variantImages),
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
          // 新建：没选图时必须给一张占位图，否则前台卡片是空白。
          const insertImages = hasRealImages(images) ? images : [PLACEHOLDER_IMAGE_URL];

          await client.query(
            `insert into public.mods
               (title, character, version, game_version, description, images, drive_links,
                variant_images, nsfw, xxmi_install_guide, game_key, is_published, is_available, created_at)
             values ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, $8::jsonb, $9, $10, $11, true, true, $12)`,
            [
              row.title,
              row.character,
              row.version,
              row.gameVersion,
              row.description,
              insertImages,
              JSON.stringify(row.driveLinks),
              JSON.stringify(variantImages),
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
