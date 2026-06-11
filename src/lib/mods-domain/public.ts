import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { defaultGameKey } from "@/config/games";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import { logger } from "@/lib/logger";
import { modCacheTags } from "@/lib/mod-cache";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import { applyModQueryFilters, applyModSort, modIdSchema, normalizeCharacterName, sortModsByHot } from "@/lib/mods-domain/sorting";
import type { ModRow, PaginatedResult, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

export async function getAvailableCharacters(gameKey = defaultGameKey) {
  "use cache";
  cacheTag(modCacheTags.characters);
  cacheTag(`mods:characters:${gameKey}`);
  cacheLife("hours");

  try {
    const supabase = createPublicReadClient();
    const { data, error } = await supabase
      .from("mods")
      .select("character")
      .eq("is_published", true)
      .eq("game_key", gameKey);

    if (error) {
      return defaultCharacterSuggestions;
    }

    const dynamicCharacters = Array.from(
      new Set(
        (data ?? [])
          .map((row) => normalizeCharacterName(String(row.character ?? "")))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));

    return dynamicCharacters.length > 0 ? dynamicCharacters : defaultCharacterSuggestions;
  } catch {
    return defaultCharacterSuggestions;
  }
}

export async function getCharacterSuggestions(gameKey = defaultGameKey) {
  const publishedCharacters = await getAvailableCharacters(gameKey);
  const mergedCharacters = Array.from(new Set([...publishedCharacters, ...defaultCharacterSuggestions]));
  return mergedCharacters.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function getPublicMods(limit?: number, filters: PublicModsFilters = {}) {
  "use cache";
  cacheTag(modCacheTags.list);
  cacheLife("minutes");

  const { gameKey = defaultGameKey, sort = "latest" } = filters;
  let supabase;
  try {
    supabase = createPublicReadClient();
  } catch (error) {
    logger.warn("[mods] getPublicMods skipped because Supabase env is missing", { error: error instanceof Error ? error.message : "unknown" });
    return [] satisfies SiteMod[];
  }

  const { data, error } = await supabase
    .from("mods")
    .select(publicModColumns)
    .eq("is_published", true)
    .eq("game_key", gameKey);

  if (error) {
    logger.warn("[mods] getPublicMods failed, fallback to empty list", { error: error.message });
    return [] satisfies SiteMod[];
  }

  const mods = applyModQueryFilters((data ?? []).map((row) => mapMod(row as ModRow)), filters);
  const sortedMods = sort === "hot" ? sortModsByHot(mods) : applyModSort(sort)(mods);

  return typeof limit === "number" ? sortedMods.slice(0, limit) : sortedMods;
}

export async function getFeaturedMods(limit: number, gameKey = defaultGameKey) {
  return getPublicMods(limit, { gameKey, sort: "hot" });
}

export async function getWeeklyHotMods(limit: number, gameKey = defaultGameKey) {
  const hotMods = await getPublicMods(undefined, { gameKey, sort: "hot" });
  const latestTimestamp = hotMods.reduce((maxTimestamp, mod) => Math.max(maxTimestamp, Date.parse(mod.createdAt)), 0);
  const since = latestTimestamp - 7 * 24 * 60 * 60 * 1000;
  const weeklyMods = hotMods.filter((mod) => Date.parse(mod.createdAt) >= since);

  if (weeklyMods.length > 0) {
    return weeklyMods.slice(0, limit);
  }

  return hotMods.slice(0, limit);
}

export async function getTopRatedMods(limit: number, gameKey = defaultGameKey) {
  return getPublicMods(limit, { gameKey, sort: "rating" });
}

export async function getLatestMods(limit: number, gameKey = defaultGameKey) {
  return getPublicMods(limit, { gameKey, sort: "latest" });
}

export async function getPublicModsPage(page: number, pageSize: number, filters: PublicModsFilters = {}): Promise<PaginatedResult<SiteMod>> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const sort = filters.sort ?? "latest";
  const allMods = await getPublicMods(undefined, { ...filters, sort });
  const from = (safePage - 1) * safePageSize;
  const items = allMods.slice(from, from + safePageSize);
  const hasMore = from + safePageSize < allMods.length;

  const totalPages = Math.max(1, Math.ceil(allMods.length / safePageSize));

  return {
    hasMore,
    items,
    nextPage: hasMore ? safePage + 1 : null,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function getPublicModBaseById(id: string, gameKey?: string) {
  "use cache";

  const parsedId = modIdSchema.safeParse(id);

  if (!parsedId.success) {
    return null;
  }

  cacheTag(modCacheTags.detail(parsedId.data));
  if (gameKey) {
    cacheTag(`mods:detail:${gameKey}:${parsedId.data}`);
  }
  cacheLife("minutes");

  let supabase;
  try {
    supabase = createPublicReadClient();
  } catch (error) {
    logger.warn("[mods] getPublicModBaseById skipped because Supabase env is missing", { error: error instanceof Error ? error.message : "unknown" });
    return null;
  }

  let query = supabase
    .from("mods")
    .select(publicModColumns)
    .eq("id", parsedId.data)
    .eq("is_published", true);

  if (gameKey) {
    query = query.eq("game_key", gameKey);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    logger.warn("[mods] getPublicModBaseById failed, fallback to null", { error: error.message });
    return null;
  }

  return data ? mapMod(data as ModRow) : null;
}
