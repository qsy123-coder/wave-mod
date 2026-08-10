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

/** 批量切换推荐状态 */
export async function batchFeatureMods(
  ids: string[],
  isFeatured: boolean,
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
        .update({ is_featured: isFeatured })
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
  const updateData = {
    ...(fields.title?.trim() ? { title: fields.title.trim() } : {}),
    ...(fields.description?.trim() ? { description: fields.description.trim() } : {}),
    ...(fields.character?.trim() ? { character: fields.character.trim() } : {}),
    ...(fields.version?.trim() ? { version: fields.version.trim() } : {}),
    ...(fields.gameKey?.trim() ? { game_key: fields.gameKey.trim() } : {}),
    ...(fields.nsfw !== undefined ? { nsfw: fields.nsfw } : {}),
    ...(fields.downloadUrl !== undefined ? { download_url: fields.downloadUrl.trim() } : {}),
  };

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("mods") as any).update(updateData).eq("id", id);

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
      const updateData = {
        ...(fields.gameKey?.trim() ? { game_key: fields.gameKey.trim() } : {}),
        ...(fields.title?.trim() ? { title: fields.title.trim() } : {}),
        ...(fields.character?.trim() ? { character: fields.character.trim() } : {}),
        ...(fields.description?.trim() ? { description: fields.description.trim() } : {}),
        ...(fields.downloadUrl !== undefined ? { download_url: fields.downloadUrl.trim() } : {}),
        ...(fields.videoUrl !== undefined ? { video_url: fields.videoUrl.trim() } : {}),
        ...(fields.imageUrls !== undefined ? { images: fields.imageUrls.filter(Boolean) } : {}),
        ...(fields.nsfw !== undefined ? { nsfw: fields.nsfw } : {}),
      };

      if (Object.keys(updateData).length === 0) {
        result.success++;
        continue;
      }

      const { data: mod } = await supabase.from("mods").select("title").eq("id", id).single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("mods") as any).update(updateData).eq("id", id);

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
