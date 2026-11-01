import "server-only";

import { applyAdminModsView, type AdminModsFilters } from "@/lib/admin/mods-filters";
import { queryRows } from "@/lib/db/query";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { AdminMod, ModRow } from "@/lib/mods-domain/types";

/** 管理员视角获取全部 Mod（含草稿），支持 gameKey / status SQL 级过滤 + 内存排序筛选 */
export async function getAdminMods(filters: AdminModsFilters = {}) {
  // 原实现用 service_role 分批（1000 行/批）拉全表。自建库没有行数上限，
  // 直接一条带 SQL 级过滤的查询更简单；5578 行的一次性传输在本机/香港-香港链路上可忽略。
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.gameKey) {
    params.push(filters.gameKey);
    conditions.push(`game_key = $${params.length}`);
  }

  if (filters.status === "published") {
    conditions.push("is_published = true");
  } else if (filters.status === "draft") {
    conditions.push("is_published = false");
  }

  const whereSql = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  try {
    const rows = await queryRows<ModRow>(
      `select ${publicModColumns}
         from public.mods
         ${whereSql}
        order by created_at desc`,
      params,
    );

    const mods = rows.map((row) => ({
      ...mapMod(row),
      isPublished: row.is_published,
    } satisfies AdminMod));

    // 内存级排序 + 角色/关键词过滤（复用公共 mapper，泛型保留 AdminMod 类型）
    return applyAdminModsView(mods, filters);
  } catch (error) {
    logger.error("[mods] getAdminMods failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [] satisfies AdminMod[];
  }
}
