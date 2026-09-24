/**
 * 列表页筛选条件与 URL 之间的**唯一**契约。
 *
 * 谁用它：
 * - 服务端 `ModsListing`：构建期没有 URL，用 `DEFAULT_MODS_FILTERS` 预渲染默认视图
 * - 客户端 `ModsUrlDriven`：从 `useSearchParams()` 解出真正生效的筛选
 * - `/api/mods`：翻页请求带的是同一套参数名（见 mods-infinite-grid 的 fetchModsPage）
 *
 * 为什么必须单独抽一个模块：`/mods` 现在是预渲染的，**HTML 里那份内容只能是「默认
 * 筛选」的结果**，而客户端 hydration 之后要按 URL 渲染。两边一旦各写一套解析，
 * 就会出现「HTML 显示默认列表、点了筛选却没反应」这类极难查的错位。
 *
 * 本模块必须保持**纯净**（只依赖 zod 与纯函数），因为它会被客户端组件 import。
 */

import { parseCharacterFilter, parseModFlag, parseModQuery, parseModSort } from "@/lib/mods-domain/sorting";
import type { ModSort } from "@/lib/mods-domain/types";

/**
 * 一页多少条。服务端播种（预渲染的第一页）与客户端翻页必须用同一个值，
 * 否则 `hasMore` / `nextPage` 会算错。
 */
export const MODS_PAGE_SIZE = 16;

/**
 * 一页最多多少条。**这是防呆上限，不是性能调优**：`/api/mods` 的 pageSize 直接来自
 * query string，钳制之前 `?pageSize=999999` 会把整表（约 6MB）每次请求渲染一遍并
 * 回吐给调用方 —— 一个匿名 GET 就能把 CPU 和出口流量打满（Vercel 额度就是这么没的）。
 */
export const MODS_MAX_PAGE_SIZE = 48;

/** 列表页的筛选条件。字段与 URL 参数一一对应（参数名见 buildModsFilterHref）。 */
export type ModsFilters = {
  sort: ModSort;
  character?: string;
  query?: string;
  /** 只看有直链下载的（download_url 非空） */
  direct: boolean;
  /** 只看有真预览图的（排除占位图） */
  preview: boolean;
};

/**
 * 无参数 URL（`/mods`）对应的筛选条件，也是**预渲染进 HTML 的那一份**。
 *
 * `sort` 取 `"latest"` 而不是 `"default"`：URL 上不写 `sort` 时 `parseModSort`
 * 就返回 `"latest"`，两者必须一致，否则默认视图的种子会被判定成「非默认筛选」而丢掉。
 */
export const DEFAULT_MODS_FILTERS: ModsFilters = {
  sort: "latest",
  direct: false,
  preview: false,
};

/** `useSearchParams()`（ReadOnlyURLSearchParams）与 `URLSearchParams` 都满足这个形状 */
export type ModsSearchParams = { get(name: string): string | null };

/** 解析 URL 上的筛选条件。解析口径与 `/api/mods` 完全一致（共用 sorting.ts 的 parse*）。 */
export function parseModsFilters(search: ModsSearchParams): ModsFilters {
  return {
    sort: parseModSort(search.get("sort") ?? undefined),
    character: parseCharacterFilter(search.get("character") ?? undefined),
    query: parseModQuery(search.get("query") ?? undefined),
    direct: parseModFlag(search.get("direct") ?? undefined),
    preview: parseModFlag(search.get("preview") ?? undefined),
  };
}

/**
 * 是否就是「默认筛选」——即 `DEFAULT_MODS_FILTERS` 那一份。
 *
 * **这个判定决定了预渲染的种子能不能用**：种子是构建期按默认筛选算出来的，
 * 把它当 `initialData` 喂给一个「只看千咲」的 URL，页面会先显示全库最新的 16 条
 * ——那是明确违反当前筛选的内容。所以只有判定为默认时才播种（见 mods-listing-view）。
 *
 * `sort` 只认 `"latest"`：`?sort=default`（按标题排序）是**另一个**筛选，不能播种。
 */
export function isDefaultModsFilters(filters: ModsFilters): boolean {
  return (
    filters.sort === "latest" &&
    !filters.character &&
    !filters.query &&
    !filters.direct &&
    !filters.preview
  );
}

/**
 * 「这是哪一份列表」的身份键：五个维度任一变，就是另一份列表。
 *
 * 谁用它：`ModsPageClient` 里网格那个滚动容器 —— 换了筛选条件就是换了一份内容，
 * 必须回到顶部。以前没这一条时它只是**碰巧**归零：从 `/mods`（默认筛选）点分类
 * 会让 Suspense 边界整棵树重建、节点是新的，于是天然 0；而带着筛选条件打开页面后
 * 再点分类只重渲染不重建，右栏就停在原来的位置（2026-09-24 用户报告）。
 * 左侧角色侧栏反过来 —— 它要跨导航**保住**位置（见 mods-listing-view）。
 *
 * 键不用 URL 原串：`?sort=latest` 与不写 sort 是同一个页面，必须给同一个键，
 * 否则点「全部」这类等价 URL 会把用户从滚动位置上无谓地拽回顶部。
 * 也不用 join("|") 拼字符串：值里带 `|` 时两份不同的筛选会撞成同一个键。
 */
export function modsListingKey(filters: ModsFilters): string {
  return JSON.stringify([
    filters.sort,
    filters.character ?? "",
    filters.query ?? "",
    filters.direct,
    filters.preview,
  ]);
}
