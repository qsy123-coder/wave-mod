import "server-only";

import { unstable_cache } from "next/cache";

import { defaultGameKey } from "@/config/games";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import { logger } from "@/lib/logger";
import { modCacheTags } from "@/lib/mod-cache";
import { mapMod, publicModColumns, publicModDetailColumns } from "@/lib/mods-domain/mappers";
import { getSnapshotRows } from "@/lib/mods-domain/snapshot";
import { MODS_MAX_PAGE_SIZE, MODS_PAGE_SIZE } from "@/lib/mods-domain/filter-params";
import { applyModQueryFilters, applyModSort, modIdSchema, normalizeCharacterName, sortFeaturedModsByOrder, sortModsByHot } from "@/lib/mods-domain/sorting";
import type { ModRow, ModsPage, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

/**
 * 单批拉取行数。
 *
 * 取 500 而非 1000，是为了让每条缓存项序列化后稳定低于 Next.js Data Cache 的
 * 2MB 单项上限（1000 行 ≈ 1.2MB，贴得太近；500 行 ≈ 0.6MB，留出安全余量）。
 * 超过上限时 Next 会静默跳过写入（dev 模式直接抛错），缓存等于没做。
 *
 * 缓存内容在 2026-09-23 从「原始行」改成了「mapMod 之后的领域对象」，体积放大
 * 1.30x：实测 500 行映射后约 518KB，占上限 25%。改这个常量前先跑
 * shard-size.test.ts，它会按新值重新量并卡住超限的情况。
 */
export const MOD_FETCH_BATCH_SIZE = 500;

/**
 * 公开读缓存的 TTL（秒）。
 *
 * 原值 300：流量连续时整表扫约合每月 40 GB 出口，而免费额度只有 5 GB ——
 * 超限即全站 402（2026-09-21 事故）。先涨到 1 小时（约 3.3 GB/月）把站救回来，
 * 再涨到 6 小时（约 0.55 GB/月）：配额是全站共享的（Auth 与 REST 同一口径），
 * 留的余量太薄，下次最先挂掉的就是登录和评论。
 *
 * 涨 TTL 不会让新上传/下架变慢 —— 两条写入路径都已经做到「写完立即失效」：
 *   - 管理后台（Server Action）→ revalidatePublicModCaches()，见 src/lib/mod-cache.ts；
 *   - 每日批量上传（scripts/upload-daily-by-date.mjs 用 psql 直连 Postgres，完全
 *     绕开 Next 运行时）→ 入库后调 POST /api/revalidate，见
 *     src/app/api/revalidate/route.ts。
 * TTL 只是「没有任何写入发生时」的兜底刷新频率。新增写库路径时务必接上通知，
 * 否则那条路上的新内容要等满一个 TTL 才露面。
 *
 * 用户互动（点赞 / 收藏 / 评分 / 评论）刻意**不**走那条路：它们只改单个 mod
 * 的计数、不改列表成员，为此清掉整张表的分片缓存是纯浪费。代价是列表卡片上的
 * 计数最多滞后一个 TTL（现在就是 6 小时；详情页不受影响），
 * 详见 revalidateModEngagementCaches。
 */
const CACHE_REVALIDATE_SECONDS = 21600;

/**
 * 分片缓存「已发布 mod 的领域对象」（即 mapMod 之后的结果）。
 *
 * 背景：/api/mods 每翻一页、以及 /mods 每次渲染，都会走 getPublicMods 把整张表
 * （当前 5292 行）拉一遍，再在内存里 filter/sort，最后只切出 16 条。
 *
 * 2026-09-23 之前这里缓存的是**原始行**，mapMod 由每个请求各做一遍。全表映射一次
 * 约 0.55s，而请求量是每个访客若干次 —— 累计烧穿了 Vercel 的 Fluid Active CPU
 * 额度（10h14m / 4h）导致整站被暂停。现在把 mapMod 收进缓存，每个 TTL 只映射一次。
 *
 * 整表结果远超 2MB 上限，不能作为单条缓存项，因此按 MOD_FETCH_BATCH_SIZE 拆成多条。
 * 实测（data/mods-snapshot.json.gz，5292 行）：500 行映射后 JSON ≈ 518KB，
 * 放大倍数 1.30x、约为上限的 1/4 —— 500 这个批量对映射后的对象依然安全。
 * 改动批量前请重跑 src/lib/mods-domain/shard-size.test.ts 复核这个数字：
 * 超过 2MB 时 Next 会**静默跳过写入**，缓存等于没做。
 *
 * filter/sort/分页仍由调用方在内存中完成（它们不修改入参，可安全复用缓存对象），
 * 因此角色别名、复合关键词搜索、hot 评分、zh-CN 排序等语义完全不变。
 */
const getCachedModShard = unstable_cache(
  async (gameKey: string, from: number): Promise<SiteMod[]> => {
    const supabase = createPublicReadClient();
    const { data, error } = await supabase
      .from("mods")
      .select(publicModColumns)
      .eq("is_published", true)
      .eq("game_key", gameKey)
      .order("created_at", { ascending: false })
      .range(from, from + MOD_FETCH_BATCH_SIZE - 1);

    if (error) {
      // 向上抛：unstable_cache 不会缓存抛出的异常，避免把一次失败固化一整个 TTL
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapMod(row as ModRow));
  },
  // key 必须与改造前的 ["public-mods-batch"] 不同：两者返回的**形状不一样**
  // （原始行 vs 领域对象）。复用同一个 key 会让新代码从旧缓存条目里读出原始行，
  // 表现为字段全 undefined 的静默脏数据，而不是报错。
  ["public-mods-shard-mapped"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: [modCacheTags.list] },
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
      // 同 getCachedModShard：抛出以免把一次失败固化一整个 TTL
      throw new Error(error.message);
    }

    return count ?? 0;
  },
  ["public-mods-count"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: [modCacheTags.list] },
);

/**
 * 取回整表**领域对象**：先按总数算出分片数，再并发拉取。
 *
 * 此前是 `for` 循环串行 await 每一片。生产环境 Supabase 在 ap-northeast-2（首尔）
 * 而 Vercel 函数默认在 iad1（美东），单次查询跨洋约 200ms，11 片串行就是 2.2s 起步。
 * 并发后回填耗时从 `分片数 × RTT` 降到约 `1 × RTT`。
 *
 * 分片全部命中缓存时不产生任何 Supabase 往返（与改动前一致），
 * 且 mapMod 也一并省掉 —— 这是本次改造的目的，见 getCachedModShard 的注释。
 */
async function getAllPublishedMods(gameKey: string): Promise<SiteMod[]> {
  try {
    const total = await getCachedPublishedModCount(gameKey);
    // 总数为 0 时也拉一片，走统一路径返回空数组
    const shardCount = Math.max(1, Math.ceil(total / MOD_FETCH_BATCH_SIZE));

    const batches = await Promise.all(
      Array.from({ length: shardCount }, (_, index) => getCachedModShard(gameKey, index * MOD_FETCH_BATCH_SIZE)),
    );

    // count 与分片是两条独立缓存项，即使同 tag 也不是原子失效，到期时刻可能相差几秒。
    // 若总数比实际偏小，末尾数据会被截断；满片说明后面可能还有，继续补拉直到出现短片。
    let from = shardCount * MOD_FETCH_BATCH_SIZE;
    let lastFetchedFull = batches[batches.length - 1]?.length === MOD_FETCH_BATCH_SIZE;
    while (lastFetchedFull) {
      const extra = await getCachedModShard(gameKey, from);
      batches.push(extra);
      from += MOD_FETCH_BATCH_SIZE;
      lastFetchedFull = extra.length === MOD_FETCH_BATCH_SIZE;
    }

    return batches.flat();
  } catch (error) {
    // Supabase 网关不可用（典型：项目因超配额被 restriction，全站 402）时回退到本地快照。
    // 故意放在这一层、而不是 getCachedModShard 内部：让失败继续向上抛，
    // 不被 unstable_cache 把兜底结果固化一整个 TTL —— 网关一恢复就能立刻回到实时数据。
    logger.warn("[mods] Supabase 读取失败，回退到本地快照", {
      error: error instanceof Error ? error.message : "unknown",
    });
    // 快照里存的是原始行，走与正常路径同一个 mapMod，保证两条路径产出的对象形状一致
    return (await getSnapshotRows(gameKey)).map((row) => mapMod(row as ModRow));
  }
}

/**
 * 已发布 mod 的角色名去重列表。
 *
 * 只取 character 一列，单条缓存项约 0.3MB，稳定低于 2MB 上限，
 * 因此整份结果可以直接作为一条缓存项（无需像 getCachedModShard 那样分片）。
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
        // 抛出而非返回兜底值：否则一次失败会被缓存一整个 TTL
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
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: [modCacheTags.characters] },
);

export async function getAvailableCharacters(gameKey = defaultGameKey) {
  try {
    const dynamicCharacters = await getCachedAvailableCharacters(gameKey);
    return dynamicCharacters.length > 0 ? dynamicCharacters : defaultCharacterSuggestions;
  } catch {
    // 网关被锁时改用本地快照推导角色列表，否则角色分类页会整片空掉。
    // 归一化与 zh-CN 排序口径与 getCachedAvailableCharacters 完全一致。
    const snapshotCharacters = Array.from(
      new Set(
        (await getSnapshotRows(gameKey))
          .map((row) => normalizeCharacterName(String(row.character ?? "")))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));

    return snapshotCharacters.length > 0 ? snapshotCharacters : defaultCharacterSuggestions;
  }
}

export async function getCharacterSuggestions(gameKey = defaultGameKey) {
  const publishedCharacters = await getAvailableCharacters(gameKey);
  const mergedCharacters = Array.from(new Set([...publishedCharacters, ...defaultCharacterSuggestions]));
  return mergedCharacters.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function getPublicMods(limit?: number, filters: PublicModsFilters = {}) {
  const { gameKey = defaultGameKey, sort = "default" } = filters;

  let allMods: SiteMod[];
  try {
    allMods = await getAllPublishedMods(gameKey);
  } catch (error) {
    // Supabase env 缺失、或某批拉取失败：回退空列表（与改动前行为一致），
    // 且失败结果不会被写入缓存，下一请求会重试。
    logger.warn("[mods] getPublicMods failed, fallback to empty list", { error: error instanceof Error ? error.message : "unknown" });
    return [] satisfies SiteMod[];
  }

  // filter/sort 保持在内存中完成：applyModQueryFilters 用 filter、applyModSort/sortModsByHot
  // 用 slice().sort()，均不修改入参，因此可以安全复用缓存里的领域对象。
  // mapMod 已在 getCachedModShard 内做过，这里不再重复映射。
  const mods = applyModQueryFilters(allMods, filters);
  const sortedMods = sort === "hot" ? sortModsByHot(mods) : applyModSort(sort)(mods);

  return typeof limit === "number" ? sortedMods.slice(0, limit) : sortedMods;
}

export async function getFeaturedMods(limit: number, gameKey = defaultGameKey) {
  // 获取手动推荐的 mod（is_featured = true），按 featured_order 升序（null 排最后）+ 创建时间倒序兜底
  try {
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
      throw new Error(error.message);
    }

    const mods = (data ?? []).map((row) => mapMod(row as ModRow));
    return sortFeaturedModsByOrder(mods).slice(0, limit);
  } catch (error) {
    // 首页轮播是唯一不走 unstable_cache 的公开读路径，网关一挂它第一个空掉
    // （2026-09-21 事故的现象就是「首页卡片全没了、/mods 却还有」）。
    // 回退到快照里的推荐位：排序口径与线上一致（featured_order 升序，null 最后）。
    logger.warn("[mods] getFeaturedMods 失败，回退到本地快照", {
      error: error instanceof Error ? error.message : "unknown",
    });

    const snapshotFeatured = (await getSnapshotRows(gameKey))
      .filter((row) => row.is_featured === true)
      .map((row) => mapMod(row as ModRow));

    return sortFeaturedModsByOrder(snapshotFeatured).slice(0, limit);
  }
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

/**
 * 把**已经筛好、排好**的整表切成第 page 页。
 *
 * 抽成纯函数是为了让「服务端预渲染第一页」（ModsListing）与「/api/mods 翻页」走同一段
 * 分页算术。两边各写一份的话，`hasMore` / `nextPage` 早晚会算不到一起，表现就是无限
 * 滚动在某一页之后突然停住、或者某一页被加载两遍。
 *
 * 入参钳制也在这里做一遍（`/api/mods` 还会再钳一次并写进缓存头）：pageSize 上限
 * `MODS_MAX_PAGE_SIZE` 是**防呆**用的 —— 见 filter-params.ts 里那个常量的注释。
 */
export function paginateMods(allMods: SiteMod[], page: number, pageSize: number): ModsPage {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.min(MODS_MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)))
    : MODS_PAGE_SIZE;
  const from = (safePage - 1) * safePageSize;
  const items = allMods.slice(from, from + safePageSize);
  const hasMore = from + safePageSize < allMods.length;

  return {
    hasMore,
    items,
    nextPage: hasMore ? safePage + 1 : null,
    page: safePage,
    pageSize: safePageSize,
    totalCount: allMods.length,
    totalPages: Math.max(1, Math.ceil(allMods.length / safePageSize)),
  };
}

export async function getPublicModsPage(page: number, pageSize: number, filters: PublicModsFilters = {}): Promise<ModsPage> {
  const sort = filters.sort ?? "default";
  const allMods = await getPublicMods(undefined, { ...filters, sort });

  // 注意：整表 filter+sort 已经在上面的 getPublicMods 里做完，这里只剩切片。
  // 调用方（如 ModsListing）自己要拿总数时，应当复用同一份 allMods 调 paginateMods，
  // 而不是再调一次本函数 —— 那会把整表扫描白跑第二遍。
  return paginateMods(allMods, page, pageSize);
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
    // 详情页要展示安装说明，是整个前台唯一需要 xxmi_install_guide 的地方，
    // 因此只有这一处用详情列清单（列表路径已裁剪该列，实测每次整表扫省下
    // 1,384,698 字节 ≈ 1.32 MiB，约占列表列集 payload 的 24%）。
    .select(publicModDetailColumns)
    .eq("id", parsedId.data)
    .eq("is_published", true);

  if (gameKey) {
    query = query.eq("game_key", gameKey);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    // 详情页同样要走快照兜底，否则网关被锁时列表有卡片、点进去却是 404。
    logger.warn("[mods] getPublicModBaseById 失败，回退到本地快照", { error: error.message });

    const snapshotRow = (await getSnapshotRows(gameKey ?? defaultGameKey)).find(
      (row) => row.id === parsedId.data,
    );
    return snapshotRow ? mapMod(snapshotRow as ModRow) : null;
  }

  return data ? mapMod(data as ModRow) : null;
}
