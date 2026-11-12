import "server-only";

import { unstable_cache } from "next/cache";

import { defaultGameKey } from "@/config/games";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import { logger } from "@/lib/logger";
import { readEngagement } from "@/lib/engagement/store";
import { modCacheTags } from "@/lib/mod-cache";
import { mapMod, publicModColumns, publicModDetailColumns } from "@/lib/mods-domain/mappers";
import { getSnapshotRows } from "@/lib/mods-domain/snapshot";
import { normalizeModsPageArgs } from "@/lib/mods-domain/filter-params";
import { applyModQueryFilters, applyModSort, modIdSchema, normalizeCharacterName, rankModsByQuery, sortFeaturedModsByOrder, sortModsByHot } from "@/lib/mods-domain/sorting";
import { queryOne, queryRows } from "@/lib/db/query";
import type { ModRow, ModsPage, ModSort, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";

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
 * 的计数、不改列表成员，为此清掉整张表的缓存是纯浪费。代价是列表卡片上的
 * 计数最多滞后一个 TTL（现在就是 12 小时；详情页的抽屉走 /api/mods/[id]，
 * 是实时的，不受影响），详见 revalidateModEngagementCaches。
 *
 * ── 2026-11-03：6 小时 → 12 小时 ────────────────────────────────────────
 *
 * 库已经迁到自建 Postgres，这条常量不再受 Supabase 出口配额约束，现在它卡住的
 * 是**函数 CPU**。ISR 重建同样计入 Fluid Active CPU，而当月额度是 4h（临时加成
 * 后 12h），实测已用 8h40m。
 *
 * ⚠️ 想改 `/mods`、`/mods/<id>` 的缓存时长，**必须动这里**：Next 的 effective
 * revalidate 取「页面自己的 `export const revalidate`」与渲染路径上所有缓存读的
 * TTL 的**最小值**。只把页面上的值调大是无效的 —— 构建后
 * `.next/prerender-manifest.json` 里 `/mods` 的 `initialRevalidateSeconds`
 * 仍然是这条常量的旧值，可以直接验证。
 */
const CACHE_REVALIDATE_SECONDS = 43200;

/**
 * 整表缓存：**进程内** TTL 缓存，不走 Next 的 Data Cache。
 *
 * ── 为什么这么改（2026-11-03）────────────────────────────────────────────
 *
 * 旧实现把整表按 500 行拆成 11 个 `unstable_cache` 条目（当时是为了绕开
 * Data Cache 单条 2MB 的上限）。实测纯计算只要 60–85ms：
 *   gunzip+parse 36ms / mapMod 8ms / zh-CN 排序 27ms / latest 排序 3ms / 搜索 9–13ms
 * 而线上 /api/mods 的 P75 是 510ms —— 差额全在「11 个分片各读一次 Data Cache」
 * 的往返上。
 *
 * 于是先试过「合成一条 gzip payload 存 Data Cache」，但线上实测**没有生效**：
 * 连发 5 个冷门请求，`pg_stat_user_tables.idx_scan` 每次都 +1，说明每个请求都
 * 重新查了一次库；本地 `.next/cache/fetch-cache` 里也确实出现过多份**内容完全相同、
 * 但文件名不同**的 832KB 条目 —— 该条目的缓存键不稳定，等于没缓存。
 *
 * 所以改成进程内缓存：不依赖 Data Cache 的任何行为，TTL 明确、可预测。
 * 代价是每个实例各自缓存一份，冷启动后第一个请求要查一次库（整表约 5.6MB）；
 * 换来的是**同一实例上后续所有请求零数据库往返**。
 *
 * 新鲜度：TTL 5 分钟，比原来 Data Cache 的 12 小时**更短**。
 * 写库路径（管理后台 / 每日上传脚本）仍然会 `revalidateTag(modCacheTags.list)`，
 * 那会清掉外层 `getCachedModsPage` 的结果缓存；最坏情况下列表多滞后 5 分钟。
 *
 * 为什么用 TTL 而不是「跟着 tag 失效」：进程内变量没有任何机制能收到 revalidateTag
 * 的通知，硬接一个版本号反而要多一次 Data Cache 读，得不偿失。
 */
const MODS_MEMO_TTL_MS = 5 * 60 * 1000;

let modsMemo: { gameKey: string; mods: SiteMod[]; expiresAt: number } | null = null;

/**
 * 取回整表**领域对象**：命中进程内缓存直接返回，否则查一次库并缓存 5 分钟。
 */
async function getAllPublishedMods(gameKey: string, strict = false): Promise<SiteMod[]> {
  if (modsMemo && modsMemo.gameKey === gameKey && Date.now() < modsMemo.expiresAt) {
    return modsMemo.mods;
  }

  try {
    // `order by created_at desc, id`：分页需要一个稳定顺序，created_at 会撞值。
    const rows = await queryRows<ModRow>(
      `select ${publicModColumns}
         from public.mods
        where is_published = true
          and game_key = $1
        order by created_at desc, id`,
      [gameKey],
    );

    const mods = rows.map(mapMod);
    modsMemo = { gameKey, mods, expiresAt: Date.now() + MODS_MEMO_TTL_MS };
    return mods;
  } catch (error) {
    // strict：调用方（列表页缓存）需要知道「这是兜底结果」，否则会把快照固化一整个 TTL。
    // 见 getPublicModsPage 的 catch —— 那边会退回到不缓存的老路径。
    if (strict) throw error;

    // Supabase 网关不可用（典型：项目因超配额被 restriction，全站 402）时回退到本地快照。
    // 故意放在这一层、而不是 getCachedModsPayload 内部：让失败继续向上抛，
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
 * 因此整份结果可以直接作为一条缓存项，不需要压缩。
 */
const getCachedAvailableCharacters = unstable_cache(
  async (gameKey: string): Promise<string[]> => {
    // 原来分页 1000 行是为了绕开 Supabase 默认 limit；SQL 的 DISTINCT 直接返回全部。
    const rows = await queryRows<{ character: string }>(
      `select distinct character
         from public.mods
        where is_published = true
          and game_key = $1`,
      [gameKey],
    );

    return Array.from(
      new Set(
        rows
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

/**
 * **后台写入口**的唯一角色白名单：库内 distinct ∪ 站内已登记角色。
 *
 * 为什么后台不能用 `getAvailableCharacters`（纯库内 distinct）：新角色的第一条 mod
 * 还没入库 ⇒ 不在 distinct 里 ⇒ 前台输入框标红「库内无此角色」、服务端也拒绝提交，
 * 于是永远进不了库（鸡生蛋）。2026-11-12 莉莉就这么卡住。
 *
 * 与命名工坊 `tools/mod-rename/lib/character-allowlist.mjs` 同一口径：
 * 任一侧认识就算合法。区别是那边走 psql 直连、这边走 Next 的 pg 连接与缓存。
 */
export async function getCharacterAllowlist(gameKey = defaultGameKey): Promise<string[]> {
  return getCharacterSuggestions(gameKey);
}

/**
 * 服务端行为选项（**不是**用户筛选条件，所以不塞进 `PublicModsFilters`）。
 *
 * `relaxQuery`：多关键词严格取交集一个都没中时，是否放宽成「命中任一关键词」。
 * 只有 /api/mods（即 /mods 的无限网格）打开它 —— 那条路径会渲染「没有精确匹配」
 * 的提示条，放宽是可见的。分站、ZZZ、后台一律保持严格 AND，避免出现「结果莫名
 * 变多了却没人解释」的静默行为变化。
 */
export type PublicModsOptions = { relaxQuery?: boolean };

/**
 * 模块内部的加载选项。
 *
 * `strict` 只给列表页缓存用：Supabase 读失败时抛错而不是回退快照，
 * 免得 `unstable_cache` 把「兜底数据」当成正常结果固化一整个 TTL。
 */
type LoadPublicModsOptions = PublicModsOptions & { strict?: boolean };

/**
 * 用互动计数器的**实时值**覆盖 views / likes / favorites。
 *
 * 为什么非做不可：这三个字段的 Supabase 列**早已没有写入方** —— 点赞、收藏、浏览
 * 都改走 `src/lib/engagement` 的本地计数器了（`like-actions` / `favorite-actions`
 * 在组件里零引用，`/api/mods/[id]/view` 也没有调用方）。而热度公式仍在读那几列，
 * 于是卡片上用 `useEngagement` 渲染的是实时值、排序用的却是冻结在基线导入那天
 * （2026-10-02）的旧值 —— 前台「浏览 200+ 却排在后面」就是这么来的。
 *
 * 顺带的好处：覆盖之后 SSR 出来的 `views` 就是实时值，卡片首屏不再先显示冻结的旧数
 * 再等客户端拉到新值 —— `useEngagement` 是**替换**语义（不是叠加），所以不会双计。
 *
 * downloads / comments / rating 三列由 Supabase 正常写入（下载路由、评论、评分），
 * 是活的，**不要**在这里覆盖。
 *
 * 必须返回**新对象**：入参是 `unstable_cache` 里缓存的那一份，就地改会污染缓存
 * （见 loadPublicMods 里那段「均不修改入参」的注释）。
 */
async function withLiveEngagement(mods: SiteMod[]): Promise<SiteMod[]> {
  if (mods.length === 0) return mods;

  // deviceId 传空：排序只需要计数，不需要「我有没有赞过」
  const { counts } = await readEngagement(
    mods.map((mod) => mod.id),
    "",
  );

  return mods.map((mod) => {
    const live = counts[mod.id];
    if (!live) return mod;
    return { ...mod, favorites: live.favorites, likes: live.likes, views: live.views };
  });
}

/**
 * 公开读的**唯一**收口：拉整表 → 筛选 → 相关度重排 → 用户排序。
 *
 * 抽出来是为了让 `getPublicMods` 与 `getPublicModsPage` 共用同一趟整表扫描：
 * `relaxed` 是「0 结果才放宽」的结果，而判断「是否 0 结果」本身就要扫完一遍，
 * 让 page 版再算一次等于把最贵的那趟跑两遍。
 */
async function loadPublicMods(
  filters: PublicModsFilters,
  options: LoadPublicModsOptions = {},
): Promise<{ mods: SiteMod[]; relaxed: boolean }> {
  const { gameKey = defaultGameKey, sort = "default" } = filters;

  let allMods: SiteMod[];
  try {
    allMods = await getAllPublishedMods(gameKey, options.strict);
  } catch (error) {
    // 缓存回填那条路必须把错误抛出去（见 LoadPublicModsOptions.strict）。
    if (options.strict) throw error;

    // Supabase env 缺失、或某批拉取失败：回退空列表（与改动前行为一致），
    // 且失败结果不会被写入缓存，下一请求会重试。
    logger.warn("[mods] getPublicMods failed, fallback to empty list", { error: error instanceof Error ? error.message : "unknown" });
    return { mods: [], relaxed: false };
  }

  // filter/sort 保持在内存中完成：applyModQueryFilters 用 filter、applyModSort/sortModsByHot
  // 用 slice().sort()，均不修改入参，因此可以安全复用缓存里的领域对象。
  // mapMod 已在生成 payload 时做过，这里不再重复映射。
  const filtered = applyModQueryFilters(allMods, filters, options);

  // hot 与 favorites 这两种排序读的正是 views/likes/favorites 那三个死列（见 withLiveEngagement），
  // 排序前必须换成实时值，否则「热度榜」和「收藏榜」都建立在冻结的数字上。
  // 其余排序（default / latest / rating）不读这三列，跳过以免白付一次全表覆盖。
  const sortInput =
    sort === "hot" || sort === "favorites" ? await withLiveEngagement(filtered.mods) : filtered.mods;
  const sortedMods = sort === "hot" ? sortModsByHot(sortInput) : applyModSort(sort)(sortInput);

  /**
   * 相关度是**主**排序键、用户选的 sort 是**次**键。
   *
   * 顺序不能反：先按相关度排、再按 sort 排的话，第二趟会把相关度完全覆盖掉 —— 那样
   * 「标题里就写着关键词的排在描述里顺带提一句的前面」这条就永远不生效了。
   * 所以先 sort 把它当底，再用稳定排序按相关度重排（rankModsByQuery 对同分返回 0）。
   */
  const rankedMods = rankModsByQuery(sortedMods, filtered.queryRanks, filtered.relaxed);

  return { mods: rankedMods, relaxed: filtered.relaxed };
}

export async function getPublicMods(limit?: number, filters: PublicModsFilters = {}) {
  // 签名与返回值都保持不变：它有 8+ 个调用方（首页、榜单、分站、种子…），
  // 那些地方要么没有 query、要么不关心放宽，没必要让它们一起改。
  const { mods } = await loadPublicMods(filters);

  return typeof limit === "number" ? mods.slice(0, limit) : mods;
}

export async function getFeaturedMods(limit: number, gameKey = defaultGameKey) {
  // 获取手动推荐的 mod（is_featured = true），按 featured_order 升序（null 排最后）+ 创建时间倒序兜底
  try {
    const rows = await queryRows<ModRow>(
      `select ${publicModColumns}, featured_order
         from public.mods
        where is_published = true
          and game_key = $1
          and is_featured = true
        order by featured_order asc nulls last, created_at desc`,
      [gameKey],
    );

    const mods = rows.map(mapMod);
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
export function paginateMods(allMods: SiteMod[], page: number, pageSize: number, relaxed = false): ModsPage {
  // 钳制口径与缓存键共用一份（filter-params.ts），否则等价 URL 会各占一个缓存项
  const { page: safePage, pageSize: safePageSize } = normalizeModsPageArgs(page, pageSize);
  const from = (safePage - 1) * safePageSize;
  const items = allMods.slice(from, from + safePageSize);
  const hasMore = from + safePageSize < allMods.length;

  return {
    hasMore,
    items,
    nextPage: hasMore ? safePage + 1 : null,
    page: safePage,
    pageSize: safePageSize,
    // 默认 false：预渲染种子那条路径（ModsListing）根本没有 query，只传三个参数
    relaxed,
    totalCount: allMods.length,
    totalPages: Math.max(1, Math.ceil(allMods.length / safePageSize)),
  };
}

/**
 * ==================== 列表页结果缓存 ====================
 *
 * 整表缓存（getCachedModsPayload）省掉了「查库 + mapMod + 解码」，但
 * **每个请求仍然要付**整表 filter/sort（5609 条，实测 10–30ms）。
 *
 * 2026-10-23 线上实测：/api/mods 单次 ≈160ms Active CPU，占全站 53%；
 * 按当时速率外推约 5.5 CPU 小时/月，而 Hobby 的额度只有 4 小时/月
 * （超了不是计费，是项目直接被暂停）。
 *
 * 所以再加一层「整页结果」缓存：命中时连 filter/sort 都不用做，直接返回这一页。
 * 香港反代日志同日显示 /api/mods 的请求里 90% 不带搜索词、40% 是 STALE
 * （缓存过期回源），这一层的键空间因此是可控的。
 *
 * 四条边界：
 *   1. **带 query 的请求单独一条短缓存**（60 秒，见 getCachedSearchPage）：
 *      搜索词长尾无界，只能给很短的 TTL；它命中时省掉的是整表扫描，
 *      未命中时也和改动前一样走实时路径。
 *   2. **hot / favorites 单独 60 秒**：这两种排序读点赞/收藏的实时计数，
 *      和「列表成员」不是一个变化频率，不能共用 12 小时 TTL。
 *   3. **Supabase 失败时不缓存兜底快照**：缓存函数用 strict，失败就抛给
 *      getPublicModsPage，由它退回不缓存的老路径（见下面的 catch）。
 *   4. **角色名超长的不进缓存**：防匿名请求用超长字符串刷出无数缓存项。
 */
const LIVE_PAGE_CACHE_SECONDS = 60;

/**
 * 角色名超过这个长度就不进缓存。
 *
 * 正常角色名最长也就十来个字；这个上限只防「匿名请求用一个超长字符串
 * 刷出无数个缓存项」。超限的请求仍能正常返回，只是不缓存。
 */
const MAX_CACHED_CHARACTER_LENGTH = 64;

type ModsPageCacheArgs = {
  character: string;
  direct: boolean;
  gameKey: string;
  page: number;
  pageSize: number;
  preview: boolean;
  sort: ModSort;
};

/**
 * `query` 单独传、不进 `args`：它**不能**出现在缓存键里（长尾无界），
 * 只有「不缓存」那条分支会带上它。缓存分支调用时永远是 undefined。
 */
async function computeModsPage(
  args: ModsPageCacheArgs,
  options: LoadPublicModsOptions = {},
  query?: string,
): Promise<ModsPage> {
  const { mods, relaxed } = await loadPublicMods(
    {
      character: args.character || undefined,
      direct: args.direct,
      gameKey: args.gameKey,
      preview: args.preview,
      query,
      sort: args.sort,
    },
    options,
  );

  return paginateMods(mods, args.page, args.pageSize, relaxed);
}

const getCachedModsPage = unstable_cache(
  async (args: ModsPageCacheArgs) => computeModsPage(args, { strict: true }),
  ["public-mods-page"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: [modCacheTags.list] },
);

const getCachedLiveModsPage = unstable_cache(
  async (args: ModsPageCacheArgs) => computeModsPage(args, { strict: true }),
  ["public-mods-page-live"],
  { revalidate: LIVE_PAGE_CACHE_SECONDS, tags: [modCacheTags.list] },
);

/**
 * 搜索结果页的 60 秒缓存。
 *
 * 香港反代的日志（2026-11-03）显示 `/api/mods` 的请求里 **73–75% 带 `query=`**，
 * 而带 query 的请求在**两层**都被绕开：nginx 的 `proxy_cache_bypass $arg_query`
 * 和应用这边 `cacheable = !filters.query`。于是每次搜索都要走一遍整表扫描 ——
 * 11-02 那天是 5,109 次搜索，按单次 0.51s 算约 43 分钟 CPU，一天就吃掉月度 4h 额度的 18%。
 *
 * 60 秒是刻意的折中：搜索词长尾（11-02 有 2,101 个不同 URL），TTL 长了会把缓存区撑爆；
 * 而同一个词在几十秒内被重复请求（联想 → 回车 → 刷新）是最常见的重复形态。
 * 命中时省掉一次整表扫描，未命中时与改动前完全一样。
 */
const SEARCH_PAGE_CACHE_SECONDS = 60;

const getCachedSearchPage = unstable_cache(
  async (args: ModsPageCacheArgs, query: string) => computeModsPage(args, { strict: true }, query),
  ["public-mods-search-page"],
  { revalidate: SEARCH_PAGE_CACHE_SECONDS, tags: [modCacheTags.list] },
);

export async function getPublicModsPage(
  page: number,
  pageSize: number,
  filters: PublicModsFilters = {},
  options: PublicModsOptions = {},
): Promise<ModsPage> {
  // 钳制后再进缓存键：?page=0 与 ?page=1 是同一页，不该各占一个缓存项
  const { page: safePage, pageSize: safePageSize } = normalizeModsPageArgs(page, pageSize);

  const args: ModsPageCacheArgs = {
    character: filters.character ?? "",
    direct: Boolean(filters.direct),
    gameKey: filters.gameKey ?? defaultGameKey,
    page: safePage,
    pageSize: safePageSize,
    preview: Boolean(filters.preview),
    sort: filters.sort ?? "default",
  };

  // 角色名超长的（防缓存轰炸）直接走实时路径，不缓存
  if (args.character.length > MAX_CACHED_CHARACTER_LENGTH) {
    return computeModsPage(args, options, filters.query);
  }

  if (filters.query) {
    try {
      return await getCachedSearchPage(args, filters.query);
    } catch (error) {
      // 与下面浏览型那条一样：读失败时退回实时路径（它会走快照兜底），
      // 而不是把失败固化一整个 TTL。注意必须把 query 带上，否则会返回未筛选的结果。
      logger.warn("[mods] 搜索页缓存回填失败，本次走实时路径", {
        error: error instanceof Error ? error.message : "unknown",
      });
      return computeModsPage(args, options, filters.query);
    }
  }

  const readPage =
    args.sort === "hot" || args.sort === "favorites" ? getCachedLiveModsPage : getCachedModsPage;

  try {
    return await readPage(args);
  } catch (error) {
    // 走到这里通常是 Supabase 读失败（strict 故意抛出来，避免把快照固化一整个 TTL）。
    // 退回不缓存的老路径：它会走 getSnapshotRows 兜底，行为与改动前一致。
    logger.warn("[mods] 列表页缓存回填失败，本次走实时路径", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return computeModsPage(args, options);
  }
}

/**
 * 按 id 批量取 mod，**保持传入顺序**（「我的收藏」要按收藏时间倒序展示）。
 *
 * 走 getAllPublishedMods（整表 payload 缓存，失败回退快照）再在内存里筛：
 * 既不碰 Supabase（网关 402 时它照样能用），也不必为这个低频场景新开一个查询维度。
 * 收藏通常只有几十条，整表扫描的成本可以忽略。
 */
export async function getPublicModsByIds(ids: string[], gameKey = defaultGameKey): Promise<SiteMod[]> {
  if (ids.length === 0) return [];

  let allMods: SiteMod[];
  try {
    allMods = await getAllPublishedMods(gameKey);
  } catch (error) {
    logger.warn("[mods] getPublicModsByIds failed, fallback to empty list", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }

  const byId = new Map(allMods.map((mod) => [mod.id, mod]));
  return ids.map((id) => byId.get(id)).filter((mod): mod is SiteMod => Boolean(mod));
}

export async function getPublicModBaseById(id: string, gameKey?: string) {
  const parsedId = modIdSchema.safeParse(id);

  if (!parsedId.success) {
    return null;
  }

  // 详情页要展示安装说明，是整个前台唯一需要 xxmi_install_guide 的地方，
  // 因此只有这一处用详情列清单（列表路径已裁剪该列，实测每次整表扫省下
  // 1,384,698 字节 ≈ 1.32 MiB，约占列表列集 payload 的 24%）。
  const params: unknown[] = [parsedId.data];
  let sql = `select ${publicModDetailColumns}
               from public.mods
              where id = $1
                and is_published = true`;

  if (gameKey) {
    params.push(gameKey);
    sql += " and game_key = $2";
  }

  try {
    const row = await queryOne<ModRow>(sql, params);
    return row ? mapMod(row) : null;
  } catch (error) {
    // 详情页同样要走快照兜底，否则数据库不可用时列表有卡片、点进去却是 404。
    logger.warn("[mods] getPublicModBaseById 失败，回退到本地快照", {
      error: error instanceof Error ? error.message : "unknown",
    });

    const snapshotRow = (await getSnapshotRows(gameKey ?? defaultGameKey)).find(
      (row) => row.id === parsedId.data,
    );
    return snapshotRow ? mapMod(snapshotRow as ModRow) : null;
  }
}
