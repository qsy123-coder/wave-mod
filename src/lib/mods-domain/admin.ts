import "server-only";

import { applyAdminModsView, type AdminModsFilters } from "@/lib/admin/mods-filters";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { AdminMod, ModRow } from "@/lib/mods-domain/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** 管理员视角获取全部 Mod（含草稿），支持 gameKey / status SQL 级过滤 + 内存排序筛选 */
export async function getAdminMods(filters: AdminModsFilters = {}) {
  const supabase = createAdminClient();

  if (!supabase) {
    logger.error("[mods] getAdminMods missing admin client");
    return [] satisfies AdminMod[];
  }

  // 分页获取所有 mods（解决 Supabase 默认 1,000 行限制）
  let allRows: Record<string, unknown>[] = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    let batchQuery = supabase
      .from("mods")
      .select(publicModColumns);

    // SQL 级过滤：游戏
    if (filters.gameKey) {
      batchQuery = batchQuery.eq("game_key", filters.gameKey);
    }

    // SQL 级过滤：发布状态
    if (filters.status === "published") {
      batchQuery = batchQuery.eq("is_published", true);
    } else if (filters.status === "draft") {
      batchQuery = batchQuery.eq("is_published", false);
    }

    const { data, error } = await batchQuery
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      logger.error("[mods] getAdminMods failed", { error: error.message });
      return [] satisfies AdminMod[];
    }

    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  const mods = (allRows ?? []).map((row) => {
    const typedRow = row as ModRow;
    return {
      ...mapMod(typedRow),
      isPublished: typedRow.is_published,
    } satisfies AdminMod;
  });

  // 内存级排序 + 角色/关键词过滤（复用公共 mapper，泛型保留 AdminMod 类型）
  return applyAdminModsView(mods, filters);
}
