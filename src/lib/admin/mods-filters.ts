import { z } from "zod";

import { games } from "@/config/games";
import {
  applyModQueryFilters,
  applyModSort,
  parseCharacterFilter,
  parseModQuery,
  sortModsByHot,
} from "@/lib/mods-domain/sorting";
import type { AdminMod, SiteMod } from "@/lib/mods-domain/types";

// ==================== Schemas & Types ====================

export const adminModSortSchema = z.enum(["latest", "hot", "downloads", "favorites", "rating"]);
export const adminModStatusSchema = z.enum(["all", "published", "draft"]);

export type AdminModSort = z.infer<typeof adminModSortSchema>;
export type AdminModStatus = z.infer<typeof adminModStatusSchema>;

/** 管理员 Mod 列表筛选条件 */
export type AdminModsFilters = {
  character?: string;
  gameKey?: string;
  query?: string;
  sort?: AdminModSort;
  status?: AdminModStatus;
};

const VALID_GAME_KEYS: Set<string> = new Set(games.map((g) => g.key));

// ==================== Parsers ====================

export function parseAdminModSort(v: string | undefined): AdminModSort {
  return adminModSortSchema.safeParse(v).data ?? "latest";
}

export function parseAdminModStatus(v: string | undefined): AdminModStatus {
  return adminModStatusSchema.safeParse(v).data ?? "all";
}

/** 将 URL game 参数映射为 GameKey，非法值返回 undefined（fallback 到全部游戏） */
export function parseAdminGameKey(v: string | undefined): string | undefined {
  const trimmed = v?.trim();
  return trimmed && VALID_GAME_KEYS.has(trimmed as string) ? trimmed : undefined;
}

/**
 * 将 URL searchParams 映射为 AdminModsFilters
 * @param params raw searchParams（character / game / query / sort / status）
 */
export function parseAdminModsSearchParams(params: {
  character?: string;
  game?: string;
  query?: string;
  sort?: string;
  status?: string;
}): AdminModsFilters {
  return {
    character: parseCharacterFilter(params.character),
    gameKey: parseAdminGameKey(params.game),
    query: parseModQuery(params.query),
    sort: parseAdminModSort(params.sort),
    status: parseAdminModStatus(params.status),
  };
}

// ==================== URL Builder ====================

/**
 * 构建管理员 Mod 列表的超链接（保留其他参数，最终路径固定 /admin/mods）
 *
 * 参数顺序（固定用于测试断言）：game, status, sort, query, character
 * 省略规则：
 *   - gameKey undefined → 不写 game
 *   - status undefined 或 "all" → 不写 status
 *   - sort undefined 或 "latest" → 不写 sort
 *   - query / character undefined 或空 → 不写
 */
export function buildAdminModsHref(filters: AdminModsFilters): string {
  const params = new URLSearchParams();

  if (filters.gameKey) params.set("game", filters.gameKey);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.sort && filters.sort !== "latest") params.set("sort", filters.sort);
  if (filters.query) params.set("query", filters.query);
  if (filters.character) params.set("character", filters.character);

  const qs = params.toString();
  return qs ? `/admin/mods?${qs}` : "/admin/mods";
}

// ==================== Data Transform ====================

/**
 * 按筛选条件对 Mod 列表排序 + 过滤（全部在内存中完成，复用公共 sorting mapper）
 *
 * @generic T extends SiteMod —— 保持 AdminMod 等子类型不被窄化为 SiteMod
 */
export function applyAdminModsView<T extends SiteMod>(
  mods: T[],
  filters: Pick<AdminModsFilters, "character" | "query" | "sort">,
): T[] {
  // 过滤：复用（签名 applyModQueryFilters(mods, filters)，非柯里化）
  const filtered = applyModQueryFilters(mods, filters) as T[];

  const sort = (filters.sort as AdminModSort) ?? "latest";

  if (sort === "downloads") {
    return filtered.slice().sort((a, b) => b.downloads - a.downloads || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  if (sort === "hot") {
    return sortModsByHot(filtered) as T[];
  }

  // 剩余 sort 落在 "latest" | "favorites" | "rating"（Exclude<ModSort, "hot">）
  return applyModSort(sort)(filtered) as T[];
}

// ==================== Character Stats ====================

/**
 * 从管理员视角 Mod 列表统计每个角色的 mod 数量（包含草稿，跨所有游戏合并）
 */
export function getAdminCharacterCounts(mods: AdminMod[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const mod of mods) {
    const name = mod.character?.trim();
    if (name) {
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  return counts;
}

/** 允许排序的特殊分类名，显示在角色列表顶部 */
export const ADMIN_SPECIAL_CATEGORIES = ["Skins", "Other/Misc", "UI"] as const;

/**
 * 按项目 localeCompare 排序角色名（中文前置），Skins/Other/Misc/UI 排在头部
 */
export function sortAdminCharacterNames(names: string[]): string[] {
  const special = ADMIN_SPECIAL_CATEGORIES.filter((c) => names.includes(c));
  const rest = names.filter((n) => !ADMIN_SPECIAL_CATEGORIES.includes(n as (typeof ADMIN_SPECIAL_CATEGORIES)[number]));
  rest.sort((a, b) => a.localeCompare(b, "zh-CN"));
  return [...special, ...rest];
}

// ==================== UI 选项常量 ====================

export const adminModSortOptions: { label: string; value: AdminModSort }[] = [
  { label: "最新发布", value: "latest" },
  { label: "热门趋势", value: "hot" },
  { label: "最多下载", value: "downloads" },
  { label: "最多收藏", value: "favorites" },
  { label: "最高评分", value: "rating" },
];

export const adminModStatusOptions: { label: string; value: AdminModStatus }[] = [
  { label: "全部", value: "all" },
  { label: "已发布", value: "published" },
  { label: "草稿", value: "draft" },
];
