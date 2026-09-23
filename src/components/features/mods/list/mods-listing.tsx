import { Suspense } from "react";

import { ModsListingView } from "@/components/features/mods/list/mods-listing-view";
import { ModsUrlDriven } from "@/components/features/mods/list/mods-url-driven";
import { BodyScrollLock } from "@/components/layout/body-scroll-lock";
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
  const [availableCharacters, allMods] = await Promise.all([
    getCharacterSuggestions(),
    // 这一份就是「默认筛选」（sort=latest、无角色/搜索/开关）的结果，
    // 排序口径与客户端翻页请求 /api/mods?sort=latest 完全一致。
    getPublicMods(undefined, { sort: DEFAULT_MODS_FILTERS.sort }),
  ]);

  const counts: Record<string, number> = {};
  for (const mod of allMods) {
    const name = normalizeCharacterName(mod.character ?? "");
    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }

  const seed = paginateMods(allMods, 1, MODS_PAGE_SIZE);

  const defaultView = (
    <ModsListingView
      filters={DEFAULT_MODS_FILTERS}
      availableCharacters={availableCharacters}
      counts={counts}
      staticSeed={seed}
      openModId={openModId}
    />
  );

  return (
    <>
      {/* 骨架屏阶段也锁定 body 滚动，避免加载时仍可滑动 */}
      <BodyScrollLock />
      <Suspense fallback={defaultView}>
        <ModsUrlDriven
          defaultView={defaultView}
          availableCharacters={availableCharacters}
          counts={counts}
          openModId={openModId}
        />
      </Suspense>
    </>
  );
}
