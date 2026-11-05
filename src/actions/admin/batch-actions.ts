"use server";

import { revalidatePath } from "next/cache";
import { execute, queryOne, queryRows } from "@/lib/db/query";
import { buildUpdateAssignments } from "@/lib/db/sql";
import { logger } from "@/lib/logger";
import { mapMod } from "@/lib/mods-domain/mappers";
import type { ModRow, SiteMod } from "@/lib/mods-domain/types";

export type BatchResult = {
  success: number;
  failed: { id: string; title: string; error: string }[];
};

/** 批量切换推荐状态 */
export async function batchFeatureMods(
  ids: string[],
  isFeatured: boolean,
): Promise<BatchResult> {

  if (ids.length === 0) {
    return { success: 0, failed: [] };
  }

  try {
    // 一条语句更新全部：原来逐条调 REST，N 条就是 N 个往返。
    await execute("update public.mods set is_featured = $1 where id = any($2::uuid[])", [
      isFeatured,
      ids,
    ]);

    revalidatePath("/admin/mods");
    return { success: ids.length, failed: [] };
  } catch (error) {
    // 批量语句失败时无法区分是哪一条，统一回填到全部 id（与原实现的可观测结果一致）。
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      success: 0,
      failed: ids.map((id) => ({ id, title: "", error: message })),
    };
  }
}

/** 批量切换发布状态 */
export async function batchPublishMods(
  ids: string[],
  isPublished: boolean,
): Promise<BatchResult> {

  if (ids.length === 0) {
    return { success: 0, failed: [] };
  }

  try {
    await execute("update public.mods set is_published = $1 where id = any($2::uuid[])", [
      isPublished,
      ids,
    ]);

    revalidatePath("/admin/mods");
    return { success: ids.length, failed: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      success: 0,
      failed: ids.map((id) => ({ id, title: "", error: message })),
    };
  }
}

/** 批量删除 */
export async function batchDeleteMods(ids: string[]): Promise<BatchResult> {

  const result: BatchResult = { success: 0, failed: [] };

  for (const id of ids) {
    try {
      // `returning title` 同时承担「查名称用于错误反馈」和「删除」两件事。
      const row = await queryOne<{ title: string }>(
        "delete from public.mods where id = $1 returning title",
        [id],
      );

      // 原实现对「id 不存在」也算成功（Supabase delete 不报错），这里保持一致。
      void row;
      result.success++;
    } catch (error) {
      result.failed.push({
        id,
        title: "",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  revalidatePath("/admin/mods");
  return result;
}

/** 批量编辑（仅更新非空字段） */
export async function batchUpdateMods(
  ids: string[],
  fields: {
    title?: string;
    description?: string;
    character?: string;
    version?: string;
    gameKey?: string;
    nsfw?: boolean;
    downloadUrl?: string;
  },
): Promise<BatchResult> {

  const result: BatchResult = { success: 0, failed: [] };

  // 只更新非空字段
  const updateData: Record<string, unknown> = {
    ...(fields.title?.trim() ? { title: fields.title.trim() } : {}),
    ...(fields.description?.trim() ? { description: fields.description.trim() } : {}),
    ...(fields.character?.trim() ? { character: fields.character.trim() } : {}),
    ...(fields.version?.trim() ? { version: fields.version.trim() } : {}),
    ...(fields.gameKey?.trim() ? { game_key: fields.gameKey.trim() } : {}),
    ...(fields.nsfw !== undefined ? { nsfw: fields.nsfw } : {}),
    ...(fields.downloadUrl !== undefined ? { download_url: fields.downloadUrl.trim() } : {}),
  };

  const { assignments, values } = buildUpdateAssignments(updateData);

  if (!assignments) {
    return { success: 0, failed: ids.map((id) => ({ id, title: "", error: "没有提供任何要更新的字段" })) };
  }

  for (const id of ids) {
    try {
      await queryOne<{ title: string }>(
        `update public.mods set ${assignments} where id = $${values.length + 1} returning title`,
        [...values, id],
      );
      result.success++;
    } catch (error) {
      result.failed.push({
        id,
        title: "",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  logger.info("[admin] batchUpdateMods completed", {
    total: ids.length,
    success: result.success,
    failed: result.failed.length,
  });

  revalidatePath("/admin/mods");
  return result;
}

/** 批量获取 Mod 详情（用于批量编辑表单回填） */
export async function batchGetModDetails(ids: string[]): Promise<SiteMod[]> {
  if (ids.length === 0) return [];

  try {
    const rows = await queryRows<ModRow>(
      "select * from public.mods where id = any($1::uuid[])",
      [ids],
    );

    return rows.map(mapMod);
  } catch (error) {
    logger.warn("[admin] batchGetModDetails failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

export type ModUpdateFields = {
  gameKey?: string;
  title?: string;
  character?: string;
  description?: string;
  downloadUrl?: string;
  videoUrl?: string;
  /** 网盘链接；drive_links 是 jsonb，写库前必须 JSON.stringify（见下方） */
  driveLinks?: { platform: string; url: string }[];
  imageUrls?: string[];
  nsfw?: boolean;
};

/** 批量独立更新：每个 Mod 可设不同字段值 */
export async function batchUpdateModsIndividually(
  updates: { id: string; fields: ModUpdateFields }[],
): Promise<BatchResult> {

  const result: BatchResult = { success: 0, failed: [] };

  for (const { id, fields } of updates) {
    try {
      const updateData: Record<string, unknown> = {
        ...(fields.gameKey?.trim() ? { game_key: fields.gameKey.trim() } : {}),
        ...(fields.title?.trim() ? { title: fields.title.trim() } : {}),
        ...(fields.character?.trim() ? { character: fields.character.trim() } : {}),
        ...(fields.description?.trim() ? { description: fields.description.trim() } : {}),
        ...(fields.downloadUrl !== undefined ? { download_url: fields.downloadUrl.trim() } : {}),
        ...(fields.videoUrl !== undefined ? { video_url: fields.videoUrl.trim() } : {}),
        // drive_links 是 jsonb：对象数组必须显式 JSON.stringify，否则 pg 会按 Postgres 数组编码
        ...(fields.driveLinks !== undefined ? { drive_links: JSON.stringify(fields.driveLinks) } : {}),
        ...(fields.imageUrls !== undefined ? { images: fields.imageUrls.filter(Boolean) } : {}),
        ...(fields.nsfw !== undefined ? { nsfw: fields.nsfw } : {}),
      };

      const { assignments, values } = buildUpdateAssignments(updateData);

      if (!assignments) {
        result.success++;
        continue;
      }

      await queryOne<{ title: string }>(
        `update public.mods set ${assignments} where id = $${values.length + 1} returning title`,
        [...values, id],
      );
      result.success++;
    } catch (error) {
      result.failed.push({
        id,
        title: "",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  revalidatePath("/admin/mods");
  return result;
}
