"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/actions/auth/auth-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { mapMod } from "@/lib/mods-domain/mappers";
import type { ModRow, SiteMod } from "@/lib/mods-domain/types";

export type BatchResult = {
  success: number;
  failed: { id: string; title: string; error: string }[];
};

/** 批量切换发布状态 */
export async function batchPublishMods(
  ids: string[],
  isPublished: boolean,
): Promise<BatchResult> {
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  const result: BatchResult = { success: 0, failed: [] };

  if (!supabase) {
    return { success: 0, failed: ids.map((id) => ({ id, title: "", error: "数据库连接失败" })) };
  }

  for (const id of ids) {
    try {
      const { error } = await supabase
        .from("mods")
        .update({ is_published: isPublished })
        .eq("id", id);

      if (error) {
        result.failed.push({ id, title: "", error: error.message });
      } else {
        result.success++;
      }
    } catch (err) {
      result.failed.push({
        id,
        title: "",
        error: err instanceof Error ? err.message : "未知错误",
      });
    }
  }

  revalidatePath("/admin/mods");
  return result;
}

/** 批量删除 */
export async function batchDeleteMods(ids: string[]): Promise<BatchResult> {
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  const result: BatchResult = { success: 0, failed: [] };

  if (!supabase) {
    return { success: 0, failed: ids.map((id) => ({ id, title: "", error: "数据库连接失败" })) };
  }

  for (const id of ids) {
    try {
      // 先查名称用于错误反馈
      const { data: mod } = await supabase
        .from("mods")
        .select("title")
        .eq("id", id)
        .single();

      const { error } = await supabase.from("mods").delete().eq("id", id);

      if (error) {
        result.failed.push({ id, title: mod?.title ?? "", error: error.message });
      } else {
        result.success++;
      }
    } catch (err) {
      result.failed.push({
        id,
        title: "",
        error: err instanceof Error ? err.message : "未知错误",
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
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  const result: BatchResult = { success: 0, failed: [] };

  if (!supabase) {
    return { success: 0, failed: ids.map((id) => ({ id, title: "", error: "数据库连接失败" })) };
  }

  // 只更新非空字段
  const updateData: Record<string, unknown> = {};
  if (fields.title?.trim()) updateData.title = fields.title.trim();
  if (fields.description?.trim()) updateData.description = fields.description.trim();
  if (fields.character?.trim()) updateData.character = fields.character.trim();
  if (fields.version?.trim()) updateData.version = fields.version.trim();
  if (fields.gameKey?.trim()) updateData.game_key = fields.gameKey.trim();
  if (fields.nsfw !== undefined) updateData.nsfw = fields.nsfw;
  if (fields.downloadUrl !== undefined) updateData.download_url = fields.downloadUrl.trim();

  if (Object.keys(updateData).length === 0) {
    return { success: 0, failed: ids.map((id) => ({ id, title: "", error: "没有提供任何要更新的字段" })) };
  }

  for (const id of ids) {
    try {
      const { data: mod } = await supabase
        .from("mods")
        .select("title")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("mods")
        .update(updateData)
        .eq("id", id);

      if (error) {
        result.failed.push({ id, title: mod?.title ?? "", error: error.message });
      } else {
        result.success++;
      }
    } catch (err) {
      result.failed.push({
        id,
        title: "",
        error: err instanceof Error ? err.message : "未知错误",
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
  const supabase = createAdminClient();
  if (!supabase || ids.length === 0) return [];

  const { data, error } = await supabase
    .from("mods")
    .select("*")
    .in("id", ids);

  if (error || !data) {
    logger.warn("[admin] batchGetModDetails failed", { error: error?.message });
    return [];
  }

  return (data as ModRow[]).map((row) => mapMod(row));
}

export type ModUpdateFields = {
  gameKey?: string;
  title?: string;
  character?: string;
  description?: string;
  downloadUrl?: string;
  videoUrl?: string;
  imageUrls?: string[];
  nsfw?: boolean;
};

/** 批量独立更新：每个 Mod 可设不同字段值 */
export async function batchUpdateModsIndividually(
  updates: { id: string; fields: ModUpdateFields }[],
): Promise<BatchResult> {
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  const result: BatchResult = { success: 0, failed: [] };

  if (!supabase) {
    return { success: 0, failed: updates.map((u) => ({ id: u.id, title: "", error: "数据库连接失败" })) };
  }

  for (const { id, fields } of updates) {
    try {
      const updateData: Record<string, unknown> = {};
      if (fields.gameKey?.trim()) updateData.game_key = fields.gameKey.trim();
      if (fields.title?.trim()) updateData.title = fields.title.trim();
      if (fields.character?.trim()) updateData.character = fields.character.trim();
      if (fields.description?.trim()) updateData.description = fields.description.trim();
      if (fields.downloadUrl !== undefined) updateData.download_url = fields.downloadUrl.trim();
      if (fields.videoUrl !== undefined) updateData.video_url = fields.videoUrl.trim();
      if (fields.imageUrls !== undefined) updateData.images = fields.imageUrls.filter(Boolean);
      if (fields.nsfw !== undefined) updateData.nsfw = fields.nsfw;

      if (Object.keys(updateData).length === 0) {
        result.success++;
        continue;
      }

      const { data: mod } = await supabase.from("mods").select("title").eq("id", id).single();
      const { error } = await supabase.from("mods").update(updateData).eq("id", id);

      if (error) {
        result.failed.push({ id, title: mod?.title ?? "", error: error.message });
      } else {
        result.success++;
      }
    } catch (err) {
      result.failed.push({ id, title: "", error: err instanceof Error ? err.message : "未知错误" });
    }
  }

  revalidatePath("/admin/mods");
  return result;
}
