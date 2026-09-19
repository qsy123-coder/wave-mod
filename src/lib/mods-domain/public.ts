import "server-only";

import { unstable_cache } from "next/cache";

import { defaultGameKey } from "@/config/games";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import { logger } from "@/lib/logger";
import { modCacheTags } from "@/lib/mod-cache";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import { applyModQueryFilters, applyModSort, modIdSchema, normalizeCharacterName, sortFeaturedModsByOrder, sortModsByHot } from "@/lib/mods-domain/sorting";
import type { ModRow, PaginatedResult, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

/**
 * 单批拉取行数。
 *
 * 取 500 而非 1000，是为了让每条缓存项序列化后稳定低于 Next.js Data Cache 的
 * 2MB 单项上限（1000 行 ≈ 1.2MB，贴得太近；500 行 ≈ 0.6MB，留出安全余量）。
 * 超过上限时 Next 会静默跳过写入（dev 模式直接抛错），缓存等于没做。
 */
const MOD_FETCH_BATCH_SIZE = 500;

/**
 * 分片缓存「已发布 mod 原始行」。
 *
 * 背景：/api/mods 每翻一页、以及 /mods 每次渲染，都会走 getPublicMods 把整张表
 * （当前 5162 行 ≈ 6MB）拉一遍，再在内存里 filter/sort，最后只切出 16 条。
 * 这是前台「拿到 URL 慢」的主因。
 *
 * 整表结果远超 2MB，不能作为单条缓存项，因此按 MOD_FETCH_BATCH_SIZE 拆成多条。
 * 缓存里存的只是原始行，filter/sort/分页仍由调用方在内存中完成，
 * 因此角色别名、复合关键词搜索、hot 评分、zh-CN 排序等语义完全不变。
 */
const getCachedModRowBatch = unstable_cache(
  async (gameKey: string, from: number): Promise<Record<string, unknown>[]> => {
    const supabase = createPublicReadClient();
    const { data, error } = await supabase
      .from("mods")
      .select(publicModColumns)
      .eq("is_published", true)
      .eq("game_key", gameKey)
      .order("created_at", { ascending: false })
      .range(from, from + MOD_FETCH_BATCH_SIZE - 1);

    if (error) {
      // 向上抛：unstable_cache 不会缓存抛出的异常，避免把一次失败固化 5 分钟
      throw new Error(error.message);
    }

    return data ?? [];
  },
  ["public-mods-batch"],
  { revalidate: 300, tags: [modCacheTags.list] },
);

/**
 * 已发布 mod 的总行数，仅用于确定要并发拉几个分片。
 *
 * 用 `head: true` 只取 count 不取行，返回体极小，可安全作为单条缓存项。
 * 与分片缓存同一个 tag，revalidateTag 时一起失效。
 */
const getCachedPublishedModCount = unstable_cache(
  async (gameKey: string): Promise<number> => {
    const supabase = createPublicReadClient();
    const { count, error } = await supabase
      .from("mods")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("game_key", gameKey);

    if (error) {
      // 同 getCachedModRowBatch：抛出以免把一次失败固化 5 分钟
      throw new Error(error.message);
    }

    return count ?? 0;
  },
  ["public-mods-count"],
  { revalidate: 300, tags: [modCacheTags.list] },
);

/**
 * 取回整表原始行：先按总数算出分片数，再并发拉取。
 *
 * 此前是 `for` 循环串行 await 每一片。生产环境 Supabase 在 ap-northeast-2（首尔）
 * 而 Vercel 函数默认在 iad1（美东），单次查询跨洋约 200ms，11 片串行就是 2.2s 起步。
 * 并发后回填耗时从 `分片数 × RTT` 降到约 `1 × RTT`。
 *
 * 分片全部命中缓存时不产生任何 Supabase 往返（与改动前一致）。
 */
async function getAllPublishedModRows(gameKey: string): Promise<Record<string, unknown>[]> {
  const total = await getCachedPublishedModCount(gameKey);
  // 总数为 0 时也拉一片，走统一路径返回空数组
  const shardCount = Math.max(1, Math.ceil(total / MOD_FETCH_BATCH_SIZE));

  const batches = await Promise.all(
    Array.from({ length: shardCount }, (_, index) => getCachedModRowBatch(gameKey, index * MOD_FETCH_BATCH_SIZE)),
  );

  // count 与分片是两条独立缓存项，即使同 tag 也不是原子失效，到期时刻可能相差几秒。
  // 若总数比实际偏小，末尾数据会被截断；满片说明后面可能还有，继续补拉直到出现短片。
  let from = shardCount * MOD_FETCH_BATCH_SIZE;
  let lastFetchedFull = batches[batches.length - 1]?.length === MOD_FETCH_BATCH_SIZE;
  while (lastFetchedFull) {
    const extra = await getCachedModRowBatch(gameKey, from);
    batches.push(extra);
    from += MOD_FETCH_BATCH_SIZE;
    lastFetchedFull = extra.length === MOD_FETCH_BATCH_SIZE;
  }

  return batches.flat();
}

/**
 * 已发布 mod 的角色名去重列表。
 *
 * 只取 character 一列，单条缓存项约 0.3MB，稳定低于 2MB 上限，
 * 因此整份结果可以直接作为一条缓存项（无需像 getCachedModRowBatch 那样分片）。
 */
const getCachedAvailableCharacters = unstable_cache(
  async (gameKey: string): Promise<string[]> => {
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
        // 抛出而非返回兜底值：否则一次失败会被缓存 5 分钟
        throw new Error(error.message);
      }

      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < batchSize) break;
      from += batchSize;
    }

    return Array.from(
      new Set(
        allData
          .map((row) => normalizeCharacterName(String(row.character ?? "")))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  },
  ["available-characters"],
  { revalidate: 300, tags: [modCacheTags.characters] },
);

export async function getAvailableCharacters(gameKey = defaultGameKey) {
  try {
    const dynamicCharacters = await getCachedAvailableCharacters(gameKey);
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

  let allRows: Record<string, unknown>[];
  try {
    allRows = await getAllPublishedModRows(gameKey);
  } catch (error) {
    // Supabase env 缺失、或某批拉取失败：回退空列表（与改动前行为一致），
    // 且失败结果不会被写入缓存，下一请求会重试。
    logger.warn("[mods] getPublicMods failed, fallback to empty list", { error: error instanceof Error ? error.message : "unknown" });
    return [] satisfies SiteMod[];
  }

  // filter/sort 保持在内存中完成：applyModQueryFilters 用 filter、applyModSort/sortModsByHot
  // 用 slice().sort()，均不修改入参，因此可以安全复用缓存里的原始行。
  const mods = applyModQueryFilters(allRows.map((row) => mapMod(row as ModRow)), filters);
  const sortedMods = sort === "hot" ? sortModsByHot(mods) : applyModSort(sort)(mods);

  return typeof limit === "number" ? sortedMods.slice(0, limit) : sortedMods;
}

export async function getFeaturedMods(limit: number, gameKey = defaultGameKey) {
  // 获取手动推荐的 mod（is_featured = true），按 featured_order 升序（null 排最后）+ 创建时间倒序兜底
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("mods")
    .select(`${publicModColumns}, featured_order`)
    .eq("is_published", true)
    .eq("game_key", gameKey)
    .eq("is_featured", true)
    .order("featured_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn("[mods] getFeaturedMods failed, fallback to empty list", { error: error.message });
    return [] satisfies SiteMod[];
  }

  const mods = (data ?? []).map((row) => mapMod(row as ModRow));
  return sortFeaturedModsByOrder(mods).slice(0, limit);
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
