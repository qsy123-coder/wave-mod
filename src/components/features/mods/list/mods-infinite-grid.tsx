"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModCard } from "@/components/common/mod-card";
import { CardDownloadAction } from "@/components/features/mods/detail/card-download-action";
import type { MasonryColumns } from "@/components/features/mods/list/use-layout-preference";
import { MasonryCardSkeleton, ModCardSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import type { ModSort, ModsPage, SiteMod } from "@/lib/mods";
import { MODS_PAGE_SIZE } from "@/lib/mods-domain/filter-params";

/**
 * 往上找最近的滚动容器：列表是在它里面滚的，不是整个窗口。
 *
 * 为什么 observer 必须拿它当 root：rootMargin 只扩展 **root** 的边界，中间层祖先的
 * 裁剪框照旧生效（规范里先按祖先逐层裁剪，最后才跟扩展过的 root 求交）。用默认
 * root（视口）时，位于容器可视区外的哨兵一律算不相交 —— 于是 `rootMargin: 800px`
 * 形同虚设，必须一路滑到真正的底部才触发加载（2026-09-22 用户报告）。
 * 换成滚动容器本身当 root，800px 才真的是「提前 800px 开始加载」。
 * 整页滚动的场景（游戏分站的列表）找不到容器，退回视口，行为不变。
 */
function findScrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

async function fetchModsPage({
  character,
  direct,
  gameKey,
  page,
  preview,
  query,
  sort,
}: {
  character?: string;
  direct?: boolean;
  gameKey?: string;
  page: number;
  preview?: boolean;
  query?: string;
  sort: ModSort;
}): Promise<ModsPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(MODS_PAGE_SIZE),
    sort,
  });

  if (character) {
    params.set("character", character);
  }

  if (gameKey) {
    params.set("gameKey", gameKey);
  }

  if (query) {
    params.set("query", query);
  }

  // 两个开关跟着翻页一起发给服务端。少了这两行，第 2 页起会把筛选悄悄丢回「全部」
  if (direct) {
    params.set("direct", "1");
  }

  if (preview) {
    params.set("preview", "1");
  }

  const response = await fetch(`/api/mods?${params.toString()}`);

  if (!response.ok) {
    throw new Error("加载 MOD 列表失败。");
  }

  return response.json();
}

type ModsInfiniteGridProps = {
  character?: string;
  gameKey?: string;
  /**
   * 服务端预渲染好的第一页。**不给就是不播种**（undefined），这时网格会自己拉第一页
   * 并显示骨架 —— 不要拿一个空数组冒充「已加载」：那会让 hasNextPage 立刻变假，
   * 页面直接显示「已经翻到底了」。
   */
  initialMods?: SiteMod[];
  /** 与 initialMods 配套：那一页对应的全库总数（工具栏「共 N 个 MOD」） */
  initialTotalCount?: number;
  query?: string;
  sort: ModSort;
  /** 只看有直链下载的（服务端过滤，见 applyModQueryFilters） */
  direct?: boolean;
  /** 只看有真预览图的（服务端过滤） */
  preview?: boolean;
  onCardClick?: (modId: string) => void;
  /**
   * 取数状态变化时回调（每次状态变化都会报当前值，不是「开始/结束」两次通知）。
   * 上层用它驱动进度条与「共 N 个 MOD」。详见函数体里那段注释。
   */
  onStatusChange?: (status: ModsGridStatus) => void;
  isLoggedIn?: boolean;
  layoutMode?: "grid" | "masonry";
  masonryColumns?: MasonryColumns;
};

/** 网格对外汇报的取数状态 */
export type ModsGridStatus = {
  /** 第一页还没到（翻页不算） */
  loading: boolean;
  /** 当前筛选下的全库总数；loading 中或请求失败时为 null */
  totalCount: number | null;
};

export function ModsInfiniteGrid({ character, direct = false, gameKey, initialMods, initialTotalCount, preview = false, query, sort, onCardClick, onStatusChange, isLoggedIn = false, layoutMode = "masonry", masonryColumns }: ModsInfiniteGridProps) {
  // 哨兵节点用 callback ref 存进 state，而不是 useRef。
  //
  // 哨兵是**条件渲染**的（hasNextPage 为假时不渲染），节点会在挂载/卸载之间切换，
  // observer 必须跟着重建。用 useRef + 只依赖 [fetchNextPage, hasNextPage,
  // isFetchingNextPage] 的话：只要有那么一次 effect 跑在「哨兵还没渲染」的时刻，
  // ref.current 就是 null，observer 直接不建 —— 之后依赖不变、effect 不再跑，
  // 于是滑到底也永远不加载、骨架也不出，就卡在那儿（2026-09-22 用户报告）。
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  // 服务端给的种子。hasMore 直接由「这一页是不是满的」推出来：总数 25、每页 16 时
  // 第一页就是 16 条（满）⇒ 还有下一页；总数 12 时是 12 条（不满）⇒ 到底了。
  const staticSeed: ModsPage | null = initialMods
    ? {
        hasMore: initialMods.length === MODS_PAGE_SIZE,
        items: initialMods,
        nextPage: initialMods.length === MODS_PAGE_SIZE ? 2 : null,
        page: 1,
        pageSize: MODS_PAGE_SIZE,
        totalCount: initialTotalCount ?? initialMods.length,
        totalPages: 1,
      }
    : null;

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isPending,
  } = useInfiniteQuery({
    queryKey: ["mods", { character, direct, gameKey, preview, query, sort }],
    queryFn: ({ pageParam }) =>
      fetchModsPage({ character, direct, gameKey, page: pageParam, preview, query, sort }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    // 没有种子（= 筛选条件非默认）时**不能**给 initialData，否则网格会以为第一页
    // 已经拿到了。见 Props 里 initialMods 的注释。
    initialData: staticSeed ? { pageParams: [1], pages: [staticSeed] } : undefined,
    // 与 /api/mods 的 s-maxage=300 对齐：同一个筛选在 5 分钟内来回切不再重复请求。
    // 种子（服务端预渲染的那一页）也因此不会一挂载就立刻被重拉一遍。
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 筛选全在服务端做（页面上是 URL 参数、这里只负责跟着翻页），所以这一层不再过滤，
  // 拿到的就是当页真正的结果 —— 计数也就能用服务端的总数。
  // 没有 initialData 时 data 是 undefined，必须兜住。
  const mods = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  /**
   * 把取数状态**镜像**给上层：顶部进度条按它起停，工具栏那句「共 N 个 MOD」用它的真总数。
   *
   * 为什么是「镜像当前状态」而不是「开始/结束两次通知」：一对 start/stop 只要有一边漏掉
   * 就永久卡住（2026-09-21 那次「点了筛选一直骨架屏」正是如此）。镜像没有这个失败模式
   * —— 每次状态变化都会把当前值报上去，网格落定就一定报 false。
   *
   * 也因此调用方**不应该**在点击时自己 startLoading：`/mods?sort=latest` 点「全部」这类
   * 导航，URL 变了但解析出来的筛选一模一样，queryKey 不变、不会发起任何请求，自己起的
   * 进度条就没人负责停。
   *
   * `loading` 只跟**第一页还没到**（isPending）走，不跟翻页走：无限滚动时顶部闪一条
   * 进度条太吵。总数在 isPending 期间报 null（那时 data 是空的）—— 上层据此不显示计数，
   * 而不是显示一个 0。
   */
  useEffect(() => {
    onStatusChange?.({
      loading: isPending,
      totalCount: isPending ? null : (data?.pages[0]?.totalCount ?? null),
    });
  }, [data, isPending, onStatusChange]);

  // 依赖里必须带上 sentinel 节点本身：节点换了就重建 observer。
  // isFetchingNextPage 也在依赖里 —— 每次取数状态变化都会重建，而新 observer 的首次
  // 回调会按当时的真实位置重算一次，于是「加载完一页后哨兵仍在视野内」能自动续上一页，
  // 不会停在半截等着用户再滑一下。
  useEffect(() => {
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      // root 必须是列表自己的滚动容器（/mods 壳里是 mods-page-client 那层
      // overflow-y-auto），理由见 findScrollParent 的注释。
      { root: findScrollParent(sentinel), rootMargin: "800px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, fetchNextPage, hasNextPage, isFetchingNextPage]);

  // ==================== 瀑布流 JS 布局 ====================

  const isMasonry = layoutMode === "masonry";

  // 列数：用户手动选择优先，否则自动根据容器宽度计算
  const masonryRef = useRef<HTMLElement | null>(null);
  const [autoColCount, setAutoColCount] = useState(5);
  const colCount = masonryColumns ?? autoColCount;

  // 依赖里的 isLoading 不能省：加载中渲染的是骨架分支（没有 masonryRef 挂上去），
  // 只依赖 [isMasonry, masonryColumns] 的话，等数据到达、真正带 ref 的那层挂上来时
  // 这个 effect 不会重跑，observer 就永远没建 —— 列数会一直停在初始值，
  // 窗口拉宽拉窄都不再响应。
  useEffect(() => {
    if (!isMasonry || masonryColumns || isLoading) return;
    const el = masonryRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setAutoColCount(Math.max(1, Math.floor(w / 220)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMasonry, masonryColumns, isLoading]);

  // 列归属记忆：mod.id → 列索引，列数不变时保证已有卡片零抖动。
  // 额外记录该记忆对应的列数；列数切换时重建，否则旧列分配会残留，导致新增列空置。
  const colMapRef = useRef<{ colCount: number; map: Map<string, number> }>({
    colCount: -1,
    map: new Map(),
  });

  // 分配卡片到各列（colMapRef 是为零抖动设计的渲染期缓存，需 suppress refs 规则）
  /* eslint-disable react-hooks/refs */
  const columns = useMemo(() => {
    if (!isMasonry) return [];
    // 列数变化 → 重置列归属记忆，全部卡片重新按最短列分配
    if (colMapRef.current.colCount !== colCount) {
      colMapRef.current = { colCount, map: new Map() };
    }
    const colMap = colMapRef.current.map;
    const cols: SiteMod[][] = Array.from({ length: colCount }, () => []);
    const seen = new Set<string>();

    for (const mod of mods) {
      seen.add(mod.id);
      const prev = colMap.get(mod.id);
      if (prev !== undefined && prev < colCount) {
        cols[prev].push(mod);
        continue;
      }
      // 新卡片 → 最短列
      let shortest = 0;
      for (let i = 1; i < cols.length; i++) {
        if (cols[i].length < cols[shortest].length) shortest = i;
      }
      cols[shortest].push(mod);
      colMap.set(mod.id, shortest);
    }

    return cols;
  }, [mods, colCount, isMasonry]);
  /* eslint-enable react-hooks/refs */

  // 清理已移出列表的卡片（ref 操作必须在 effect 中）
  useEffect(() => {
    const colMap = colMapRef.current.map;
    const modIds = new Set(mods.map((m) => m.id));
    if (colMap.size > modIds.size * 2) {
      for (const id of colMap.keys()) {
        if (!modIds.has(id)) colMap.delete(id);
      }
    }
  }, [mods]);

  // mod.id → 全局索引（用于动画序号）
  const modIndex = useMemo(() => {
    const m = new Map<string, number>();
    mods.forEach((mod, i) => m.set(mod.id, i));
    return m;
  }, [mods]);

  // 卡片渲染函数（grid/masonry 共用）
  const renderCard = useCallback(
    (mod: SiteMod, idx: number) => (
      <ModCard
        mod={mod}
        href={gameKey ? `/${gameKey}/mods/${mod.id}` : `/mods/${mod.id}`}
        onCardClick={onCardClick}
        isLoggedIn={isLoggedIn}
        variant="list"
        className="bg-[#fff8ef] p-2.5"
        imageAspectClassName={isMasonry ? "auto" : "aspect-[5/6] sm:aspect-[4/5]"}
        imagePriority={idx < 4}
        imageFetchPriority={idx < 4 ? "high" : "auto"}
        imageSizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
        mediaTopRight={
          mod.driveLinks.length > 0 ? (
            <CardDownloadAction driveLinks={mod.driveLinks} />
          ) : mod.downloadUrl ? (
            <span className="inline-flex items-center border-2 border-black bg-[#4ade80] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]">
              直链下载
            </span>
          ) : undefined
        }
        mediaTopRightClassName="absolute right-2 top-2"
      />
    ),
    [gameKey, onCardClick, isLoggedIn, isMasonry],
  );

  /**
   * 第一页还没到：显示骨架。
   *
   * 骨架必须自己按当前布局渲染，而不是让上层拿一坨通用骨架把整个网格换掉 ——
   * 那样加载中的骨架与加载完的版式对不上，数据一到整页会跳一下。
   *
   * 只有「完全没有种子、第一页还在路上」才会走到这里（换筛选、或硬加载一个带筛选的
   * URL）；默认筛选有预渲染的种子，一挂载就是完成态。
   */
  if (isLoading) {
    return isMasonry ? (
      <section className="flex gap-4">
        {Array.from({ length: colCount }).map((_, colIdx) => (
          <div key={colIdx} className="flex flex-1 flex-col gap-4">
            {Array.from({ length: Math.ceil(MODS_PAGE_SIZE / colCount) }).map((_, si) => (
              <MasonryCardSkeleton key={si} index={colIdx * 3 + si} />
            ))}
          </div>
        ))}
      </section>
    ) : (
      <section className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: MODS_PAGE_SIZE }).map((_, i) => (
          <ModCardSkeleton key={i} />
        ))}
      </section>
    );
  }

  if (mods.length === 0) {
    return (
      <MotionReveal delay={0.16} y={24} rotate={1}>
        <section className="neo-card-lg bg-[#fff8ef] p-8 text-black">
          <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">没有匹配内容</p>
            <h2 className="mt-2 text-3xl font-black">当前筛选条件下还没有公开 MOD。</h2>
            <p className="mt-4 text-sm font-bold leading-7 text-black/75">你可以切换角色、搜索关键词或排序方式继续浏览。</p>
          </div>
        </section>
      </MotionReveal>
    );
  }

  return (
    <div className="space-y-5">
      {isMasonry ? (
        /* 瀑布流：JS 列分配 + flex 列容器，零抖动 */
        <section ref={masonryRef} className="flex gap-4">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="relative flex flex-1 flex-col gap-4">
              {col.map((mod) => {
                const idx = modIndex.get(mod.id) ?? 0;
                return (
                  <MotionReveal
                    key={mod.id}
                    delay={0.03 + (idx % 8) * 0.02}
                    y={14}
                    rotate={idx % 2 === 0 ? -1 : 1}
                  >
                    {renderCard(mod, idx)}
                  </MotionReveal>
                );
              })}
              {/* 哨兵：必须脱流（absolute），否则会在这一列里占掉一张卡的位置并额外
                  撑出两个 gap。挂在第 0 列底部即可 —— 各列是按最短列分配的，列高本就
                  接近，rootMargin 的 800px 足够覆盖这点差异（理由详见网格分支的注释）。 */}
              {colIdx === 0 && hasNextPage ? (
                <div
                  ref={setSentinel}
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 left-0 size-px"
                />
              ) : null}
              {/* 加载中骨架：每列底部多个占位卡片，填满可视区域 */}
              {isFetchingNextPage
                ? Array.from({ length: Math.ceil(16 / colCount) }).map((_, si) => (
                    <MotionReveal key={`skel-${colIdx}-${si}`} delay={0.05 + si * 0.03} y={10}>
                      <MasonryCardSkeleton index={colIdx * 3 + si} />
                    </MotionReveal>
                  ))
                : null}
            </div>
          ))}
        </section>
      ) : (
        /* 网格：CSS grid 不变 */
        <section className="relative grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
          {mods.map((mod, index) => (
            <MotionReveal
              key={`${mod.id}-${index}`}
              delay={0.03 + (index % 8) * 0.02}
              y={14}
              rotate={index % 2 === 0 ? -1 : 1}
            >
              {renderCard(mod, index)}
            </MotionReveal>
          ))}
          {/* 无限滚动哨兵：**绝对定位、不占格子**。
              它以前是 grid 的普通子元素，于是在 5 列网格里吃掉一个格子 —— 那一格
              空着，同一行后面所有卡整体错位一格、第 5 张被挤到下一行，看起来就是
              「一行 5 张里少一张」（2026-09-22 用户报告）。
              改成挂在整个网格底部：rootMargin 800px 本来就是为了「提前 800px 开始
              加载」，不再需要靠插在倒数第 6 张那里抢位置。 */}
          {hasNextPage ? (
            <div
              ref={setSentinel}
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 size-px"
            />
          ) : null}
          {/* 加载中骨架：多行占位卡片，填满下方空白 */}
          {isFetchingNextPage
            ? Array.from({ length: 15 }).map((_, i) => (
                <MotionReveal key={`skel-${i}`} delay={0.05 + i * 0.02} y={10}>
                  <ModCardSkeleton />
                </MotionReveal>
              ))
            : null}
        </section>
      )}

      {!hasNextPage && !isFetchingNextPage ? (
        <div className="flex items-center justify-center py-4">
          <div className="inline-flex items-center gap-3 border-4 border-black bg-[#ffd84f] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <Search className="size-4" />
            已经翻到底了，试试切换角色或搜索关键词
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="border-4 border-black bg-[#ffb5c3] px-5 py-4 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
          MOD 列表加载失败，请稍后重试。
        </div>
      ) : null}
    </div>
  );
}
