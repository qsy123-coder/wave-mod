import { Suspense } from "react";

import { buildLayoutHints } from "@/components/features/mods/list/masonry-packing";
import { ModsListingView } from "@/components/features/mods/list/mods-listing-view";
import { ModsUrlDriven } from "@/components/features/mods/list/mods-url-driven";
import { BodyScrollLock } from "@/components/layout/body-scroll-lock";
import { COS_IMG_HERO, withCosImageTransform } from "@/lib/cos/shared";
import { sortCharactersByRelease } from "@/lib/constants/character-release";
import { getCharacterSuggestions, getPublicMods, normalizeCharacterName, paginateMods } from "@/lib/mods";
import { DEFAULT_MODS_FILTERS, MODS_PAGE_SIZE } from "@/lib/mods-domain/filter-params";

type ModsListingProps = {
  /** `/mods/[id]` 进来时预开详情抽屉，其余情况不传 */
  openModId?: string;
};

/**
 * `/mods` 的服务端部分：**只负责算「默认筛选」的那一份数据**，不读任何请求相关的
 * 东西（无 searchParams、无 cookie），因此整页可以被预渲染并缓存。
 *
 * 以前这里做两件让本页无法缓存的事：
 * ① `await searchParams` —— 第二个动态来源（第一个是 layout 里 header 的 cookie 读取）；
 * ② `getCurrentUser()` / `isAdminUser()` —— 每次渲染都要往 Supabase Auth 打网络往返，
 *    换来的只是卡片上「收藏/点赞要不要显示成已登录」。这两件事现在都由客户端补：
 *    筛选条件从 URL 读（mods-url-driven.tsx），登录态从 SessionProvider 读。
 *
 * 副作用是**少扫两遍全表**：以前 getCharacterCounts / getPublicModsPage /
 * getPublicMods 各跑一遍整表的 filter+sort（5292 条），而 /mods 是 CPU 消耗最大的
 * 页面。现在只扫一遍，切页、算总数、算角色计数都从这一份 allMods 出来。
 *
 * ```
 * ModsListing（服务端，只算默认筛选）
 * └── <Suspense fallback={默认视图}>   ← fallback 就是预渲染进 HTML 的内容
 *     └── ModsUrlDriven（客户端，唯一调 useSearchParams 的地方）
 *         ├─ URL 无筛选 → 直接渲染上面那份默认视图（与 fallback 一模一样）
 *         └─ URL 有筛选 → 按 URL 渲染 ModsListingView（不带种子）
 * ```
 */
export async function ModsListing({ openModId }: ModsListingProps) {
  const [rawCharacters, allMods] = await Promise.all([
    getCharacterSuggestions(),
    // 这一份就是「默认筛选」（sort=latest、无角色/搜索/开关）的结果，
    // 排序口径与客户端翻页请求 /api/mods?sort=latest 完全一致。
    getPublicMods(undefined, { sort: DEFAULT_MODS_FILTERS.sort }),
  ]);

  /**
   * 侧栏 / 「全部角色分类」抽屉的顺序：按鸣潮角色首发日期倒序（新角色在前）。
   * 用户 2026-10-31 要求。排序只在这一层做 —— `getCharacterSuggestions` 还喂着
   * 后台的角色下拉框，那边保持拼音序更顺手（见 character-release.ts 的注释）。
   */
  const availableCharacters = sortCharactersByRelease(rawCharacters);

  const counts: Record<string, number> = {};
  for (const mod of allMods) {
    const name = normalizeCharacterName(mod.character ?? "");
    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }

  const seed = paginateMods(allMods, 1, MODS_PAGE_SIZE);

  /**
   * 每个角色的「版式画像」：横屏占比够高的角色，骨架屏要画成横卡。
   *
   * 在服务端算是因为**骨架屏渲染时客户端还没有任何数据** —— 骨架屏出现的时机正是
   * 第一页请求还在路上。这里顺手复用已经全量加载的 `allMods`，不多扫一次表。
   *
   * 同时登记原始角色名与归一化后的名字：URL 里两种写法都可能出现（见 buildLayoutHints）。
   */
  const layoutHints = buildLayoutHints(allMods, (character) => {
    const raw = character ?? "";
    const normalized = normalizeCharacterName(raw);
    return normalized && normalized !== raw ? [raw, normalized] : [raw];
  });

  /**
   * `/mods/<id>` 进站时预载详情抽屉的头图。
   *
   * 抽屉是客户端组件，图片要等「JS 水合 → `/api/mods/[id]` 返回」才发起请求 ——
   * 2026-10-19 实测冷启动下首图 4.3s 才开始下载、5.3s 才到。这条 preload 走浏览器的
   * 预加载扫描器，HTML 一解析就开始下，把这段等待整个省掉。
   *
   * URL 必须与 `drawer-preview-gallery.tsx` 完全一致（images[0] + COS_IMG_HERO），
   * 否则浏览器会当成两个资源、各下一遍。`allMods` 就是抽屉接口用的同一份 mapMod
   * 结果（见下方注释），这里直接复用，不额外查库。
   */
  const openMod = openModId ? allMods.find((mod) => mod.id === openModId) : undefined;
  const openModPreview =
    openMod && openMod.images.length > 0
      ? withCosImageTransform(openMod.images[0], COS_IMG_HERO)
      : undefined;

  const defaultView = (
    <ModsListingView
      filters={DEFAULT_MODS_FILTERS}
      availableCharacters={availableCharacters}
      counts={counts}
      staticSeed={seed}
      layoutHints={layoutHints}
      openModId={openModId}
    />
  );

  return (
    <>
      {/* React 19 会把这条 <link> 提到 <head>，HTML 解析阶段就开始下载详情头图 */}
      {openModPreview ? (
        <link rel="preload" as="image" href={openModPreview} fetchPriority="high" />
      ) : null}
      {/* 骨架屏阶段也锁定 body 滚动，避免加载时仍可滑动 */}
      <BodyScrollLock />
      <Suspense fallback={defaultView}>
        <ModsUrlDriven
          defaultView={defaultView}
          availableCharacters={availableCharacters}
          counts={counts}
          layoutHints={layoutHints}
          openModId={openModId}
        />
      </Suspense>
    </>
  );
}
