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

  let query = supabase
    .from("mods")
    .select(publicModColumns);

  // SQL 级过滤：游戏
  if (filters.gameKey) {
    query = query.eq("game_key", filters.gameKey);
  }

  // SQL 级过滤：发布状态（all 时不设条件，取回全部含草稿）
  if (filters.status === "published") {
    query = query.eq("is_published", true);
  } else if (filters.status === "draft") {
    query = query.eq("is_published", false);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    logger.error("[mods] getAdminMods failed", { error: error.message });
    return [] satisfies AdminMod[];
  }

  const mods = (data ?? []).map((row) => {
    const typedRow = row as ModRow;
    return {
      ...mapMod(typedRow),
      isPublished: typedRow.is_published,
    } satisfies AdminMod;
  });

  // 内存级排序 + 角色/关键词过滤（复用公共 mapper，泛型保留 AdminMod 类型）
  return applyAdminModsView(mods, filters);
}
