"use server";

import { revalidatePath } from "next/cache";

import { defaultGameKey } from "@/config/games";
import { execute, queryRows } from "@/lib/db/query";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import { buildFeaturedOrderMap, MAX_CAROUSEL_SLOTS, sortFeaturedModsByOrder } from "@/lib/mods-domain/sorting";
import type { AdminMod, ModRow } from "@/lib/mods-domain/types";

export type ReorderResult = {
  success: number;
  failed: { id: string; error: string }[];
};

export type SetFeaturedResult = {
  ok: boolean;
  error?: string;
};

/**
 * 获取主站全部「已推荐」的资源（含已下线），供推荐管理框展示。
 * 按 featured_order 升序（null 排最后）+ created_at 倒序。
 */
export async function getFeaturedModsAdmin(): Promise<AdminMod[]> {

  try {
    const rows = await queryRows<ModRow>(
      `select ${publicModColumns}, featured_order
         from public.mods
        where game_key = $1
          and is_featured = true
        order by featured_order asc nulls last, created_at desc`,
      [defaultGameKey],
    );

    const mods = rows.map((row) => ({
      ...mapMod(row),
      isPublished: row.is_published,
    } satisfies AdminMod));

    return sortFeaturedModsByOrder(mods);
  } catch (error) {
    logger.warn("[admin] getFeaturedModsAdmin failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

/**
 * 按给定顺序批量写回 featured_order：前 6 个进入轮播（1..6），
 * 其余为「待轮播」（featured_order = null），保证拖拽排序后轮播上限恒定。
 * 拖拽排序「保存」时调用，全量重写保证幂等。
 */
export async function reorderFeaturedMods(orderedIds: string[]): Promise<ReorderResult> {

  const result: ReorderResult = { success: 0, failed: [] };

  // 前 MAX_CAROUSEL_SLOTS 个进入轮播（featured_order = 1..N），其余为「待轮播」（featured_order = null）
  const orders = buildFeaturedOrderMap(orderedIds, MAX_CAROUSEL_SLOTS);

  for (const { id, featuredOrder } of orders) {
    try {
      await execute("update public.mods set featured_order = $1 where id = $2", [
        featuredOrder,
        id,
      ]);
      result.success++;
    } catch (error) {
      result.failed.push({
        id,
        error: error instanceof Error ? error.message : "未知错误",
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

  try {
    // 取消推荐时清空 featured_order，避免脏数据。
    if (isFeatured) {
      await execute("update public.mods set is_featured = true where id = $1", [id]);
    } else {
      await execute(
        "update public.mods set is_featured = false, featured_order = null where id = $1",
        [id],
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    logger.warn("[admin] setModFeatured failed", { id, error: message });
    return { ok: false, error: message };
  }

  revalidatePath("/");
  revalidatePath("/admin/mods");
  return { ok: true };
}
