/**
 * GameBanana 的 **URL 输入 → 领域取值** 的唯一契约：列表页的筛选条件，
 * 以及详情路径段里的 `gb_id`（见 `parseGamebananaGbId`）。
 *
 * 与 `mods-domain/filter-params.ts` 同构，理由也相同：`/gamebanana` 是预渲染的，
 * **HTML 里那份内容只能是「默认筛选」的结果**，而 hydration 之后要按 URL 渲染。
 * 两边一旦各写一套解析，就会出现「HTML 显示默认列表、点了筛选却没反应」这种错位。
 *
 * 本模块必须保持**纯净**（只依赖 zod 与纯函数），因为客户端组件要 import 它。
 */

import { z } from "zod";

import type { GamebananaMod, GamebananaSort, GamebananaVisibility } from "@/lib/gamebanana-domain/types";

/** 搜索词上限。URL 是外部输入，不截断的话一个 10 万字的 query 会进筛选、进键、进 DOM。 */
const MAX_QUERY_LENGTH = 100;

/** 角色名上限。站内最长角色名远小于此，超了就当没传而不是截断成另一个角色。 */
const MAX_CHARACTER_LENGTH = 40;

const sortSchema = z.enum(["latest", "hot", "views", "downloads"]);

/** 列表页的筛选条件。字段与 URL 参数一一对应。 */
export type GamebananaFilters = {
  sort: GamebananaSort;
  character?: string;
  query?: string;
  /**
   * 是否显示 `visibility = "hide"` 的记录（平台判定的 NSFW）。
   *
   * 默认 **false**：那 57%（实测 165/288）不该出现在默认列表里。
   * 打开只影响**列表展示**，详情页始终有年龄门禁（见详情页的 visibility 处理）。
   */
  nsfw: boolean;
};

/**
 * 无参数 URL（`/gamebanana`）对应的筛选条件，也是**预渲染进 HTML 的那一份**。
 *
 * `sort` 取 `"hot"`：这是个「精选」页，按点赞降序比按时间倒序更像在推荐东西；
 * 新增的 mod 点「最新加入」就能看，不必占默认位。
 */
export const DEFAULT_GAMEBANANA_FILTERS: GamebananaFilters = {
  sort: "hot",
  nsfw: false,
};

/** `useSearchParams()`（ReadOnlyURLSearchParams）与 `URLSearchParams` 都满足这个形状 */
export type GamebananaSearchParams = { get(name: string): string | null };

/** 解析 URL 上的筛选条件。所有字段都过 Zod —— URL 是外部输入（CLAUDE.md 硬规则）。 */
export function parseGamebananaFilters(search: GamebananaSearchParams): GamebananaFilters {
  const rawSort = search.get("sort") ?? undefined;
  const parsedSort = sortSchema.safeParse(rawSort);

  const rawCharacter = (search.get("character") ?? "").trim();
  const character =
    rawCharacter && rawCharacter.length <= MAX_CHARACTER_LENGTH ? rawCharacter : undefined;

  const rawQuery = (search.get("query") ?? "").trim();
  const query = rawQuery ? rawQuery.slice(0, MAX_QUERY_LENGTH) : undefined;

  // 只认 1 / true。别的写法（0/false/yes/2/…）一律当关 ——
  // 这是内容分级的开关，解析歧义必须偏向「少放行」而不是「猜用户想打开」。
  const rawNsfw = (search.get("nsfw") ?? "").toLowerCase();
  const nsfw = rawNsfw === "1" || rawNsfw === "true";

  return {
    sort: parsedSort.success ? parsedSort.data : DEFAULT_GAMEBANANA_FILTERS.sort,
    character,
    query,
    nsfw,
  };
}

/**
 * 详情路径段 `gb_id` → number，收不了就 `null`（调用方转 404）。
 *
 * 这段路径是外部输入，**不能直接扔给数据库**：非数字会让 `.eq("gb_id", NaN)`
 * 变成一次必然为空的查询，「1e3」「0x1F」「空格+数字」这些写法在 PostgREST 那边
 * 的解析口径也不由我们决定。所以只认「1~12 位纯数字且 > 0」这一种写法。
 *
 * 放在这里而不是详情页里：详情页、API 路由（抽屉的取数口）两处都要用同一把尺子，
 * 各写一份迟早在边界上分叉 —— 页面判 404 而接口判 200，就是那种分叉。
 */
export function parseGamebananaGbId(raw: string): number | null {
  if (!/^\d{1,12}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * 是否就是「默认筛选」——即 `DEFAULT_GAMEBANANA_FILTERS` 那一份。
 *
 * **这个判定决定了预渲染的种子能不能用**：种子是构建期按默认筛选算出来的，
 * 把它喂给一个「只看清宵」的 URL，页面会先显示全库最热的几条 —— 那是明确违反
 * 当前筛选的内容。所以只有判定为默认时才播种。
 */
export function isDefaultGamebananaFilters(filters: GamebananaFilters): boolean {
  return filters.sort === DEFAULT_GAMEBANANA_FILTERS.sort && !filters.character && !filters.query && !filters.nsfw;
}

/**
 * 「这是哪一份列表」的身份键：任一维度变，就是另一份列表（换了内容就该把滚动位置归零）。
 *
 * 不用 URL 原串：`?sort=hot` 与不写 sort 是同一个页面，必须给同一个键。
 * 也不用 join 拼串：值里带分隔符时两份不同的筛选会撞成同一个键（单测覆盖）。
 */
export function gamebananaListingKey(filters: GamebananaFilters): string {
  return JSON.stringify([filters.sort, filters.character ?? "", filters.query ?? "", filters.nsfw]);
}

/** 排序比较器。缺日期的排最后，不抛错也不当成「很久以前」。 */
const comparators: Record<GamebananaSort, (a: GamebananaMod, b: GamebananaMod) => number> = {
  hot: (a, b) => b.likeCount - a.likeCount,
  views: (a, b) => b.viewCount - a.viewCount,
  downloads: (a, b) => b.downloadCount - a.downloadCount,
  latest: (a, b) => {
    if (a.gbCreatedAt === b.gbCreatedAt) return 0;
    if (!a.gbCreatedAt) return 1;
    if (!b.gbCreatedAt) return -1;
    return b.gbCreatedAt.localeCompare(a.gbCreatedAt);
  },
};

/**
 * 施加筛选与排序，返回**新数组**（纯函数，不改入参）。
 *
 * 排序在筛选**之后**做：这样默认排除 hide 时，排序结果里不会出现「被滤掉的记录
 * 还占着一个位置」的错觉。
 */
export function applyGamebananaFilters(
  mods: readonly GamebananaMod[],
  filters: GamebananaFilters
): GamebananaMod[] {
  const query = filters.query?.toLowerCase();

  const filtered = mods.filter((m) => {
    // 默认只放行 show/warn。`warn` 是「需要提示」不是「禁止」，所以默认可见。
    if (!filters.nsfw && m.visibility === "hide") return false;
    if (filters.character && m.character !== filters.character) return false;
    if (query && !m.title.toLowerCase().includes(query)) return false;
    return true;
  });

  return [...filtered].sort(comparators[filters.sort]);
}

/**
 * 各可见性下的角色计数，供侧栏显示「清宵 (37)」这类数字。
 *
 * 口径必须是**当前 nsfw 开关下**的计数，否则用户会看到「清宵 (37)」但点进去只有 12 条。
 */
export function countGamebananaCharacters(
  mods: readonly GamebananaMod[],
  filters: Pick<GamebananaFilters, "nsfw">
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of mods) {
    if (!filters.nsfw && m.visibility === "hide") continue;
    counts[m.character] = (counts[m.character] ?? 0) + 1;
  }
  return counts;
}

/** 可见性是否需要在详情页拦一道（`warn` 提示、`hide` 门禁） */
export function visibilityNeedsGate(v: GamebananaVisibility): boolean {
  return v === "warn" || v === "hide";
}

/**
 * 构造筛选链接：以 `filters` 为基准打 `patch`，只把**非默认**的参数写进 query。
 *
 * 必须带上当前筛选作基准 —— 只传 patch 的话，点「按浏览量排」会把用户已选的
 * 角色清掉（那正是 `/mods` 侧栏踩过的类）。
 *
 * 清空某字段用显式 `undefined`（展开会覆盖掉基准值），不是空串：
 * `?character=` 与不写 `character` 必须落到同一个 URL，否则同一份筛选会有两个地址。
 *
 * 刻意输出**相对路径**：站点已切自托管 + 有备用域名入口，
 * 拼绝对地址会把用户从备用域名拽回主域名。
 */
export function buildGamebananaHref(
  filters: GamebananaFilters,
  patch: Partial<GamebananaFilters>
): string {
  const merged: GamebananaFilters = { ...filters, ...patch };
  const params = new URLSearchParams();

  // sort 等于默认值时不写 —— `?sort=hot` 与不写 sort 是同一份筛选，URL 必须唯一
  if (merged.sort !== DEFAULT_GAMEBANANA_FILTERS.sort) params.set("sort", merged.sort);
  if (merged.character) params.set("character", merged.character);
  if (merged.query) params.set("query", merged.query);
  if (merged.nsfw) params.set("nsfw", "1");

  const qs = params.toString();
  return qs ? `/gamebanana?${qs}` : "/gamebanana";
}
