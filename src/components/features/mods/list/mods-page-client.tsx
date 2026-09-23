"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/features/auth/session-provider";
import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid, type ModsGridStatus } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar } from "@/components/features/mods/list/mods-toolbar";
import { useLayoutPreference } from "@/components/features/mods/list/use-layout-preference";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import type { ModSort, SiteMod } from "@/lib/mods";

type ModsPageClientProps = {
  gameModsPath: string;
  initialQuery: string;
  sort: string;
  sortOptions: { label: string; value: ModSort }[];
  sortHrefs: Record<string, string>;
  /** 服务端预渲染的第一页；非默认筛选时不给（见 mods-listing-view 的 seed） */
  initialMods?: SiteMod[];
  /** 与 initialMods 同进同出：那一页对应的全库总数 */
  initialTotalCount?: number;
  character?: string;
  gameKey?: string;
  activeCharacter?: string;
  /** URL 上的「含直链」/「含预览图」开关（服务端过滤） */
  activeDirect?: boolean;
  activePreview?: boolean;
  openModId?: string;
};

export function ModsPageClient({
  gameModsPath,
  initialQuery,
  sort,
  sortOptions,
  sortHrefs,
  initialMods,
  initialTotalCount,
  character,
  gameKey,
  activeCharacter,
  activeDirect = false,
  activePreview = false,
  openModId: initialModId,
}: ModsPageClientProps) {
  /**
   * 顶部进度条的唯一写入口在下面的 handleStatusChange（网格状态镜像），
   * 这里不再由点击事件 startLoading，也不再拿 isLoading 把网格换成骨架：
   *
   * - 骨架是网格自己的事 —— 它以 queryKey 为准，换了筛选条件数据天然为空就显示骨架。
   *   以前上层用一个 isLoading 把整块网格换成通用骨架，版式与真实网格对不上。
   * - 一对 start/stop「只要有一边漏掉就永久卡住」，2026-09-21 那次「点了筛选一直
   *   骨架屏」正是如此（push 一个与当前相同的 URL 不会让服务端 props 变化，
   *   于是 stopLoading 永远不会被调用）。现在结束条件长在网格的取数状态上。
   */
  const { startLoading, stopLoading } = useNavigationLoading();

  /**
   * 登录态 / 管理员标记从客户端取。
   * 以前是服务端 `await cookies()` 后逐层传下来，那会让本页（以及整个 /mods 路由）
   * 无法静态化 —— 一次 cookies() 就是整页动态。详见 session-provider.tsx。
   */
  const { isLoggedIn, isAdmin, user } = useSession();
  const currentUserId = user?.id;
  // 抽屉自己会兜底成「我」，所以没有昵称时给「我」而不是空串
  const currentUserName = user?.displayName ?? "我";

  const { mode: layoutMode, setMode: setLayoutMode, masonryColumns, setMasonryColumns } = useLayoutPreference();

  const [gridTotal, setGridTotal] = useState<number | null>(null);

  /**
   * 把网格的取数状态镜像到进度条与计数上。
   *
   * 这里唯一要知道的规矩：**进度条只有一个写入口**，就是网格。点击筛选时不要在
   * 事件里调 startLoading —— `/mods?sort=latest` 点「全部」这类导航 URL 变了、筛选
   * 却没变，不会发起任何请求，自己起的进度条没人负责停（详见 mods-infinite-grid）。
   */
  const handleStatusChange = useCallback(
    ({ loading, totalCount }: ModsGridStatus) => {
      if (loading) startLoading();
      else stopLoading();
      setGridTotal(totalCount);
    },
    [startLoading, stopLoading],
  );

  // 网格还没报出总数时（换筛选的第一时间、或请求失败）退回服务端种子的真总数；
  // 两者都没有就先不显示计数 —— 显示一个上一套筛选的数字比不显示更糟。
  const modCount = gridTotal ?? initialTotalCount;

  const [drawerModId, setDrawerModId] = useState<string | null>(initialModId ?? null);

  const openDrawer = useCallback((modId: string) => {
    setDrawerModId(modId);
    // 必须把当前 query 带上：筛选条件只存在于 URL 上（mods-url-driven.tsx 从地址栏读），
    // 丢掉它就等于把「角色: 千咲」连同那张筛选卡片一起扔掉 —— 抽屉一开，筛选卡片消失、
    // 网格退回默认列表（2026-09-24 用户报告：从角色分类页点开 mod 详情后复现）。
    // 带上之后 /mods/<id>?character=千咲 仍是合法的分享链接；canonical 由
    // generateMetadata 固定成不带参数的形式，不会因此多出一堆重复页面。
    window.history.pushState(null, "", `/mods/${modId}${window.location.search}`);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerModId(null);
    // 关抽屉＝回到刚才那份筛选列表，而不是回到「全部」
    window.history.pushState(null, "", `/mods${window.location.search}`);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/mods\/(.+)$/);
      setDrawerModId(match ? match[1] : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <>
      <ModsToolbar
        gameModsPath={gameModsPath}
        initialQuery={initialQuery}
        sort={sort}
        sortOptions={sortOptions}
        sortHrefs={sortHrefs}
        activeDirect={activeDirect}
        activePreview={activePreview}
        activeCharacter={activeCharacter}
        activeQuery={initialQuery || undefined}
        modCount={modCount}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        masonryColumns={masonryColumns}
        onMasonryColumnsChange={setMasonryColumns}
      />

      <div className="flex-1 overflow-y-auto pt-4 scrollbar-minimal">
        <ModsInfiniteGrid
          sort={sort as ModSort}
          character={character}
          gameKey={gameKey}
          query={initialQuery || undefined}
          initialMods={initialMods}
          initialTotalCount={initialTotalCount}
          direct={activeDirect}
          preview={activePreview}
          isLoggedIn={isLoggedIn}
          layoutMode={layoutMode}
          masonryColumns={masonryColumns}
          onCardClick={openDrawer}
          onStatusChange={handleStatusChange}
        />
      </div>

      {drawerModId && (
        <ModDetailDrawer
          admin={isAdmin}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isLoggedIn={isLoggedIn}
          modId={drawerModId}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
