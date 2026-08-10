import "server-only";

import { defaultGameKey } from "@/config/games";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import { applyModQueryFilters, applyModSort, modIdSchema, normalizeCharacterName, sortModsByHot } from "@/lib/mods-domain/sorting";
import type { ModRow, PaginatedResult, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

export async function getAvailableCharacters(gameKey = defaultGameKey) {
  try {
    const supabase = createPublicReadClient();

    // 分页获取所有角色（解决 Supabase 默认 1,000 行限制）
    let allData: { character: string }[] = [];
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("mods")
        .select("character")
        .eq("is_published", true)
        .eq("game_key", gameKey)
        .order("id", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) {
        return defaultCharacterSuggestions;
      }

      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < batchSize) break;
      from += batchSize;
    }

    const dynamicCharacters = Array.from(
      new Set(
        (allData ?? [])
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
  const { gameKey = defaultGameKey, sort = "default" } = filters;
  let supabase;
  try {
    supabase = createPublicReadClient();
  } catch (error) {
    logger.warn("[mods] getPublicMods skipped because Supabase env is missing", { error: error instanceof Error ? error.message : "unknown" });
    return [] satisfies SiteMod[];
  }

  // 分页获取所有 mods（解决 Supabase 默认 1,000 行限制）
  let allRows: Record<string, unknown>[] = [];
  let from = 0;
  const batchSize = 1000;
  let pageNum = 0;
  while (true) {
    pageNum++;
    const { data, error } = await supabase
      .from("mods")
      .select(publicModColumns, { count: "exact", head: false })
      .eq("is_published", true)
      .eq("game_key", gameKey)
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);

    console.log(`[getPublicMods] page=${pageNum} from=${from} got=${data?.length ?? 0} error=${error?.message ?? "none"}`);

    if (error) {
      logger.warn("[mods] getPublicMods failed, fallback to empty list", { error: error.message });
      console.log(`[getPublicMods] ERROR: ${error.message}`);
      return [] satisfies SiteMod[];
    }

    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    console.log(`[getPublicMods] total accumulated: ${allRows.length}`);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  console.log(`[getPublicMods] FINAL total rows: ${allRows.length}`);
  const mods = applyModQueryFilters((allRows ?? []).map((row) => mapMod(row as ModRow)), filters);
  console.log(`[getPublicMods] after filter/map: ${mods.length}`);
  const sortedMods = sort === "hot" ? sortModsByHot(mods) : applyModSort(sort)(mods);
  console.log(`[getPublicMods] FINAL sorted: ${sortedMods.length}, limit=${limit}`);

  return typeof limit === "number" ? sortedMods.slice(0, limit) : sortedMods;
}

export async function getFeaturedMods(limit: number, gameKey = defaultGameKey) {
  // 获取手动推荐的 mod（is_featured = true），按创建时间倒序
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("mods")
    .select(publicModColumns)
    .eq("is_published", true)
    .eq("game_key", gameKey)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn("[mods] getFeaturedMods failed, fallback to empty list", { error: error.message });
    return [] satisfies SiteMod[];
  }

  return (data ?? []).map((row) => mapMod(row as ModRow));
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
  const sort = filters.sort ?? "default";
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
  const parsedId = modIdSchema.safeParse(id);

  if (!parsedId.success) {
    return null;
  }

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
