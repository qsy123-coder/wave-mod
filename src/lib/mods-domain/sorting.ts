import { z } from "zod";

import type { ModSort, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";

export const modIdSchema = z.uuid();
export const modSortSchema = z.enum(["default", "latest", "favorites", "rating", "hot"]);

export function calculateHotScore(mod: Pick<SiteMod, "views" | "downloads" | "favorites" | "likes" | "commentsCount" | "ratingCount" | "ratingAverage">) {
  return mod.views * 0.08 + mod.downloads * 5 + mod.favorites * 4 + mod.likes * 3 + mod.commentsCount * 5 + mod.ratingCount * 2 + mod.ratingAverage * 18;
}

export function applyModSort(sort: Exclude<ModSort, "hot">) {
  return (mods: SiteMod[]) => {
    if (sort === "default") {
      return mods
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    }

    if (sort === "favorites") {
      return mods
        .slice()
        .sort((a, b) => b.favorites - a.favorites || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    if (sort === "rating") {
      return mods
        .slice()
        .sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    return mods.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  };
}

export function sortModsByHot(mods: SiteMod[]) {
  return mods
    .slice()
    .sort((a, b) => calculateHotScore(b) - calculateHotScore(a) || b.ratingAverage - a.ratingAverage || b.views - a.views || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * 推荐 mod 排序：featuredOrder 升序（null/undefined 排最后），
 * 无顺序或顺序相同时按 created_at 倒序兜底。
 */
export function sortFeaturedModsByOrder<T extends { featuredOrder?: number | null; createdAt: string }>(mods: T[]): T[] {
  return mods.slice().sort((a, b) => {
    const ao = a.featuredOrder ?? null;
    const bo = b.featuredOrder ?? null;
    if (ao !== null && bo !== null && ao !== bo) {
      return ao - bo;
    }
    if (ao !== null && bo === null) return -1;
    if (ao === null && bo !== null) return 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

/** 前台轮播图最多展示的推荐数量；拖拽排序时前 N 位进入轮播，其余为「待轮播」 */
export const MAX_CAROUSEL_SLOTS = 6;

/**
 * 把有序 id 列表映射为 featured_order：前 maxSlots 个依次 1..maxSlots，
 * 其余为 null（「待轮播」：已推荐但暂不进轮播图）。
 */
export function buildFeaturedOrderMap(ids: string[], maxSlots: number): Array<{ id: string; featuredOrder: number | null }> {
  return ids.map((id, index) => ({
    id,
    featuredOrder: index < maxSlots ? index + 1 : null,
  }));
}

export function applyModQueryFilters(mods: SiteMod[], filters: Pick<PublicModsFilters, "character" | "query">) {
  let nextMods = mods;

  // 非角色分类名，用于 Skins 筛选时排除
  const NON_CHARACTER_CATEGORIES = new Set(["Skins", "UI", "Other/Misc"]);

  if (filters.character) {
    if (filters.character === "Skins") {
      // Skins 分类 = 展示所有角色 MOD，排除 UI / Other/Misc 等非角色分类
      nextMods = nextMods.filter((mod) => !NON_CHARACTER_CATEGORIES.has(normalizeCharacterName(mod.character ?? "")));
    } else {
      nextMods = nextMods.filter((mod) => normalizeCharacterName(mod.character ?? "") === filters.character);
    }
  }

  const normalizedQuery = filters.query
    ?.split(/[,，\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedQuery && normalizedQuery.length > 0) {
    nextMods = nextMods.filter((mod) => {
      const haystack = [mod.title, mod.character, mod.description, ...mod.driveLinks.map((d) => d.platform)].join(" ").toLowerCase();
      return normalizedQuery.every((keyword) => haystack.includes(keyword));
    });
  }

  return nextMods;
}

export function parseModSort(sort: string | undefined): ModSort {
  return modSortSchema.safeParse(sort).data ?? "latest";
}

export function parseCharacterFilter(character: string | undefined) {
  const value = character?.trim();
  return value ? value : undefined;
}

export function parseModQuery(query: string | undefined) {
  const value = query?.trim();
  return value ? value : undefined;
}

export function normalizeCharacterName(value: string) {
  // 角色名别名映射：规范化数据库中的变体名到标准名
  const CHARACTER_ALIASES: Record<string, string> = {
    "陆赫斯": "路赫斯",
    "反虚化，ui界面，场景，葫芦，特效等": "UI",
  };
  const trimmed = value.trim();
  return CHARACTER_ALIASES[trimmed] ?? trimmed;
}

export function isMissingTableError(message: string) {
  return message.includes("Could not find the table 'public.likes'") || message.includes("relation \"public.likes\" does not exist");
}

export function isAbortErrorMessage(message: string) {
  return message.toLowerCase().includes("aborterror") || message.toLowerCase().includes("operation was aborted");
}
