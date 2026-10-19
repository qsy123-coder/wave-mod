"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { useSession } from "@/components/features/auth/session-provider";
import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid, type ModsGridStatus } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar } from "@/components/features/mods/list/mods-toolbar";
import { useLayoutPreference } from "@/components/features/mods/list/use-layout-preference";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import type { ModSort, SiteMod } from "@/lib/mods";
import { cn } from "@/lib/utils";

type ModsPageClientProps = {
  gameModsPath: string;
  /**
   * 「这是哪一份列表」的身份键（filter-params 的 modsListingKey）。
   * 它一变，网格就滚回顶部 —— 见下面的 listingScrollRef。
   */
  listingKey: string;
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
  listingKey,
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

  const listingScrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * 「回到顶部」：只滚动右侧资源列表自己的滚动容器，不动窗口。
   *
   * 这个页面左边是角色分类侧栏、右边是资源流，滚动的是右边那一列；
   * 滚 window 在桌面端根本不会动（外壳 `overflow-hidden`），在手机上又会
   * 把侧栏布局一起拽走。所以必须拿 `listingScrollRef`。
   *
   * 按滚动距离显示/隐藏：刚进页面、还在最上面时不该有按钮挡住第一行卡片。
   */
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleListingScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setShowBackToTop(event.currentTarget.scrollTop > 240);
  }, []);

  const scrollListingToTop = useCallback(() => {
    listingScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /**
   * 换了筛选条件 = 另一份列表 ⇒ 网格回到顶部。
   *
   * 这条以前是**碰巧**成立的：从 `/mods`（默认筛选）点分类会让 Suspense 边界整棵树
   * 重建、这个容器是新的节点，于是天然 0；而带着筛选条件打开页面后再点分类只重渲染
   * 不重建，右栏就停在原来的位置（2026-09-24 用户报告：「点了分类右边的 mod 列表
   * 应该重置」）。现在显式按 listingKey 归零，与树重不重建无关。
   *
   * 左侧角色侧栏是反过来的：它要跨导航保住滚动位置（见 mods-listing-view）。
   * 开/关详情抽屉走的是 pushState，listingKey 不变 ⇒ 不会把人从位置上拽走。
   */
  useEffect(() => {
    const el = listingScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [listingKey]);

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
        gameKey={gameKey}
        // 联想候选项点开就地开抽屉 —— 与点卡片走同一个机制
        onSelectMod={openDrawer}
        modCount={modCount}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        masonryColumns={masonryColumns}
        onMasonryColumnsChange={setMasonryColumns}
      />

      <div
        ref={listingScrollRef}
        onScroll={handleListingScroll}
        className="flex-1 overflow-y-auto pt-4 scrollbar-minimal"
      >
        {/*
         * 回到顶部：吸顶在右侧资源区顶部、水平居中。
         *
         * 外层 h-0 是为了**不占布局**：按钮用 pt-3 溢出到内容上方，
         * 出现/隐藏不会把第一行卡片往下推。隐藏时关闭 pointer-events，
         * 避免透明按钮拦截筛选卡片或工具栏的点击。
         *
         * ⚠️ z-40 不能降：卡片上的收藏按钮是 z-20、批量复选框是 z-30，
         * 而且它们 DOM 在后、同层级会盖住这里（2026-10-19 用户反馈
         * 「被收藏按钮覆盖」）。z-40 在卡片之上、又在站点头部/详情抽屉
         * （z-50）之下，不会反过来盖住弹层。
         */}
        <div className="pointer-events-none sticky top-0 z-40 h-0">
          <div className="flex justify-center pt-3">
            <button
              type="button"
              onClick={scrollListingToTop}
              aria-label="回到顶部"
              tabIndex={showBackToTop ? 0 : -1}
              className={cn(
                "inline-flex items-center gap-1 border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition duration-200",
                showBackToTop
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0",
              )}
            >
              <ArrowUp className="size-3.5" strokeWidth={3} />
              回到顶部
            </button>
          </div>
        </div>

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
          key={drawerModId}
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
