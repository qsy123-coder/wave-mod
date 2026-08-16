"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { defaultGameKey } from "@/config/games";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import { buildFeaturedOrderMap, MAX_CAROUSEL_SLOTS, sortFeaturedModsByOrder } from "@/lib/mods-domain/sorting";
import type { AdminMod, ModRow } from "@/lib/mods-domain/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReorderResult = {
  success: number;
  failed: { id: string; error: string }[];
};

export type SetFeaturedResult = {
  ok: boolean;
  error?: string;
};

/**
 * 获取鸣潮全部「已推荐」的 mod（含已下线），供推荐管理框展示。
 * 按 featured_order 升序（null 排最后）+ created_at 倒序。
 */
export async function getFeaturedModsAdmin(): Promise<AdminMod[]> {
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  if (!supabase) {
    logger.error("[admin] getFeaturedModsAdmin missing admin client");
    return [];
  }

  const { data, error } = await supabase
    .from("mods")
    .select(`${publicModColumns}, featured_order`)
    .eq("game_key", defaultGameKey)
    .eq("is_featured", true)
    .order("featured_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn("[admin] getFeaturedModsAdmin failed", { error: error.message });
    return [];
  }

  const mods = (data ?? []).map((row) => {
    const typedRow = row as ModRow;
    return {
      ...mapMod(typedRow),
      isPublished: typedRow.is_published,
    } satisfies AdminMod;
  });

  return sortFeaturedModsByOrder(mods);
}

/**
 * 按给定顺序批量写回 featured_order：前 6 个进入轮播（1..6），
 * 其余为「待轮播」（featured_order = null），保证拖拽排序后轮播上限恒定。
 * 拖拽排序「保存」时调用，全量重写保证幂等。
 */
export async function reorderFeaturedMods(orderedIds: string[]): Promise<ReorderResult> {
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  const result: ReorderResult = { success: 0, failed: [] };

  if (!supabase) {
    return {
      success: 0,
      failed: orderedIds.map((id) => ({ id, error: "数据库连接失败" })),
    };
  }

  // 前 MAX_CAROUSEL_SLOTS 个进入轮播（featured_order = 1..N），其余为「待轮播」（featured_order = null）
  const orders = buildFeaturedOrderMap(orderedIds, MAX_CAROUSEL_SLOTS);

  for (const { id, featuredOrder } of orders) {
    try {
      const { error } = await supabase
        .from("mods")
        .update({ featured_order: featuredOrder })
        .eq("id", id);

      if (error) {
        result.failed.push({ id, error: error.message });
      } else {
        result.success++;
      }
    } catch (err) {
      result.failed.push({
        id,
        error: err instanceof Error ? err.message : "未知错误",
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/admin/mods");
  return result;
}

/**
 * 切换单个 mod 的推荐状态；取消推荐时清空 featured_order，避免脏数据。
 */
export async function setModFeatured(id: string, isFeatured: boolean): Promise<SetFeaturedResult> {
  await requireAdminUser("/admin/mods");

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, error: "数据库连接失败" };
  }

  const update: { is_featured: boolean; featured_order?: number | null } = { is_featured: isFeatured };
  if (!isFeatured) {
    update.featured_order = null;
  }

  const { error } = await supabase.from("mods").update(update).eq("id", id);

  if (error) {
    logger.warn("[admin] setModFeatured failed", { id, error: error.message });
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/mods");
  return { ok: true };
}
