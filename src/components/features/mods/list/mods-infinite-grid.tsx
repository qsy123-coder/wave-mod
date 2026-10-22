"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModCard } from "@/components/common/mod-card";
import { CardDownloadAction } from "@/components/features/mods/detail/card-download-action";
import {
  MASONRY_CARD_CHROME,
  MASONRY_DEFAULT_RATIO,
  evenColumnsForWideList,
  isWideDominantMasonry,
  masonryColumnLeft,
  masonrySpanWidth,
  packMasonry,
} from "@/components/features/mods/list/masonry-packing";
import { DESKTOP_DEFAULT_COLUMNS, columnOptionsForWidth, defaultColumnsForWidth, type MasonryColumns } from "@/components/features/mods/list/use-layout-preference";
import { MasonryCardSkeleton, ModCardSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
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
    throw new Error("加载资源列表失败。");
  }

  return response.json();
}

/**
 * 卡片图的 `sizes` 默认值（网格版式 / 瀑布流单列卡）。
 *
 * ⚠️ 瀑布流里横屏卡会**横跨两列**（见 masonry-packing.ts），实际显示宽度接近两列，
 * 必须由调用方传真实的像素宽度覆盖。只写单列的 18vw 会让浏览器按单列挑图：
 * 1440×2x 下算出 518 设备像素 → 挑 560 档，而大卡实际需要 ~800 设备像素，
 * 整张图被放大 1.4 倍（2026-10-19 用户反馈「角色分类页的图片糊」）。
 */
const DEFAULT_CARD_IMAGE_SIZES = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 18vw";

type ModsInfiniteGridProps = {
  character?: string;
  gameKey?: string;
  /**
   * 服务端预渲染好的第一页。**不给就是不播种**（undefined），这时网格会自己拉第一页
   * 并显示骨架 —— 不要拿一个空数组冒充「已加载」：那会让 hasNextPage 立刻变假，
   * 页面直接显示「已经翻到底了」。
   */
  initialMods?: SiteMod[];
  /** 与 initialMods 配套：那一页对应的全库总数（工具栏「共 N 个资源」） */
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
   * 上层用它驱动进度条与「共 N 个资源」。详见函数体里那段注释。
   */
  onStatusChange?: (status: ModsGridStatus) => void;
  isLoggedIn?: boolean;
  layoutMode?: "grid" | "masonry";
  /** 用户显式选过的列数；`null` / 不给 = 按容器宽度自适应 */
  masonryColumns?: MasonryColumns | null;
};

/** 网格对外汇报的取数状态 */
export type ModsGridStatus = {
  /** 第一页还没到（翻页不算） */
  loading: boolean;
  /** 当前筛选下的全库总数；loading 中或请求失败时为 null */
  totalCount: number | null;
  /**
   * 实际画出来的列数（瀑布流）；网格模式或还没量到宽度时为 null。
   * 工具栏用它高亮 —— 横屏为主的整类会自动降成偶数列，跟偏好值可能不同。
   */
  effectiveColumns: MasonryColumns | null;
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
        // 种子只在默认筛选（没有 query）时才给，不可能发生放宽
        relaxed: false,
        totalCount: initialTotalCount ?? initialMods.length,
        totalPages: 1,
      }
    : null;

  // 侧栏/工具栏刚点下、导航还没落地时的乐观加载态：
  // **只驱动顶部进度条**，不再把整块网格换成骨架 —— 换筛选时保留旧列表。
  const { pendingCharacter, pendingListingLoad } = useNavigationLoading();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
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
   * 「放宽」是**整次查询**的属性，不是某一页的属性 —— 服务端每次都用同一份筛选
   * 重新判定，所以各页的值必然一致，取第一页即可（`totalCount` 也是这个约定）。
   * 分页合并在上面只并 `items`，这个字段压根不参与合并。
   */
  const relaxed = data?.pages[0]?.relaxed ?? false;

  /**
   * 把取数状态**镜像**给上层：顶部进度条按它起停，工具栏那句「共 N 个资源」用它的真总数。
   *
   * 为什么是「镜像当前状态」而不是「开始/结束两次通知」：一对 start/stop 只要有一边漏掉
   * 就永久卡住（2026-09-21 那次「点了筛选一直骨架屏」正是如此）。镜像没有这个失败模式
   * —— 每次状态变化都会把当前值报上去，网格落定就一定报 false。
   *
   * 也因此调用方**不应该**在点击时自己 startLoading：`/mods?sort=latest` 点「全部」这类
   * 导航，URL 变了但解析出来的筛选一模一样，queryKey 不变、不会发起任何请求，自己起的
   * 进度条就没人负责停。
   *
   * `loading` 覆盖「第一页还没到 / 正在用旧列表占位 / 侧栏工具栏乐观态」，但不跟翻页走：
   * 无限滚动时顶部闪一条进度条太吵。总数在 isPending 期间报 null（那时 data 是空的）
   * —— 上层据此不显示计数，而不是显示一个 0。
   */
  // ⚠️ 实现见下面「列数」那一节之后 —— 它还要报**实际生效的列数**（横屏为主的整类会
  // 降成偶数列，工具栏的高亮得跟着走，否则会高亮 5 列却只画 4 列）。

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
      // 2000px：提前约两屏开始取下一页，用户滚到底之前卡片已经在路上，
      // 避免「滑到底才看到一大块骨架」。
      { root: findScrollParent(sentinel), rootMargin: "2000px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, fetchNextPage, hasNextPage, isFetchingNextPage]);

  // ==================== 瀑布流 JS 布局 ====================

  const isMasonry = layoutMode === "masonry";

  // 列数：用户显式选过就用它，否则按屏幕宽度自适应（手机 2 列 / 桌面 5 列）。
  //
  // `masonryColumns` 为 null 才会走到自适应那条路 —— 所以 use-layout-preference
  // 读不到用户选择时必须返回 null 而不是兜一个数字，否则这里右边永远取不到值，
  // 自适应就是死代码（这正是修复前手机上一屏 5 列、预览图只有 23px 的原因）。
  //
  // ⚠️ 显式选过的列数还必须按**当前档位**重新校验：localStorage 里的 6 列偏好
  // 只在挂载时按当时的宽度过滤一次，之后窗口缩到手机宽度（旋转屏幕、拉伸窗口、
  // 切到移动端模拟器）不会再校验 —— 光写 `masonryColumns ?? autoColCount` 会把
  // 6 列原样铺到 390px 屏上（2026-10-19 用户反馈「手机端还是会出现一行 6 个」）。
  // 所以每次 resize 都按当前宽度算允许集合，越档的偏好退回自适应值。
  //
  // 用**视口宽度**判定，而不是绑在网格容器上的 ResizeObserver：加载中渲染的是骨架
  // 分支，真正的网格容器还没挂上，观察器建不起来 —— 骨架会先按 5 列铺开，数据到达
  // 后才跳成 2 列。视口与容器在手机上只差两侧 padding，对 640px 这个断点没有影响。
  const [autoColState, setAutoColState] = useState<{ width: number; count: MasonryColumns }>({
    width: Number.POSITIVE_INFINITY,
    count: DESKTOP_DEFAULT_COLUMNS,
  });

  useEffect(() => {
    if (!isMasonry) return;
    const update = () => {
      const width = window.innerWidth;
      setAutoColState((prev) =>
        prev.width === width ? prev : { width, count: defaultColumnsForWidth(width) },
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isMasonry]);

  /**
   * 用户显式选过 / 按屏幕宽度自适应得到的列数。
   * 还没过「横屏为主降列」那道关 —— 那个要等图片比例，见下面的 `colCount`。
   */
  const preferredColCount =
    masonryColumns && columnOptionsForWidth(autoColState.width).includes(masonryColumns)
      ? masonryColumns
      : autoColState.count;

  /**
   * ---- 量容器宽度 ----
   *
   * 跨列卡片必须按像素算位置（列宽、卡片高度都依赖它），而 SSR 拿不到容器宽度。
   * 所以：量到之前先按老的分列方式渲染（SSR / 水合首帧就是这一份），量到之后
   * 切到绝对定位的瀑布流。用 callback ref 而不是 useEffect：<div> 只在有数据时
   * 才挂载，effect 只会跑一次，之后节点换了也没人重新观察。
   */
  const [masonryWidth, setMasonryWidth] = useState(0);
  const masonryObserverRef = useRef<ResizeObserver | null>(null);

  const attachMasonryContainer = useCallback((node: HTMLDivElement | null) => {
    masonryObserverRef.current?.disconnect();
    masonryObserverRef.current = null;
    if (!node) return;

    setMasonryWidth(node.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      // 亚像素抖动不算变化，否则侧栏动画之类会让整份瀑布流反复重排
      setMasonryWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
    });
    observer.observe(node);
    masonryObserverRef.current = observer;
  }, []);

  useEffect(() => () => masonryObserverRef.current?.disconnect(), []);

  /**
   * ---- 预览图真实宽高比 ----
   *
   * 服务端没有图片尺寸，只能等图片加载后由 ModCard 报上来。每来一张就重排整份
   * 列表会抖成幻灯片，所以攒 120ms 批量提交一次。
   *
   * 去重看 ratiosRef（已生效的值）而不是 state：ModCard 的 ref 回调会随父组件
   * 重渲染重新挂载，同一个比例会被反复上报 —— 不去重就是
   * setState → 重渲染 → 再上报 的死循环。
   */
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const ratiosRef = useRef<Record<string, number>>({});
  const pendingRatiosRef = useRef<Record<string, number>>({});
  const ratioFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 打包用的 (id, 比例) 列表；比例未知的按兜底 3/4 算（= 不算横屏） */
  const packItems = useMemo(
    () => mods.map((mod) => ({ id: mod.id, ratio: ratios[mod.id] ?? MASONRY_DEFAULT_RATIO })),
    [mods, ratios],
  );

  /**
   * 实际列数 = 偏好列数，但**横屏为主的整类降成偶数列**（5 → 4）。
   *
   * 跨两列的卡在奇数列里必然剩一列填不满（绯雪 163/198 换成横版封面后，5 列布局
   * 就是「一列从头空到底」）。比例要等图片加载才知道，所以首屏会在 5 → 4 之间重排
   * 一次；换来的是每行两张横屏卡、铺满不留空列。判据见 masonry-packing.ts。
   */
  const colCount = evenColumnsForWideList(preferredColCount, isWideDominantMasonry(packItems));

  /**
   * 把取数状态**镜像**给上层：顶部进度条按它起停，工具栏那句「共 N 个资源」用它的真总数。
   *
   * 为什么是「镜像当前状态」而不是「开始/结束两次通知」：一对 start/stop 只要有一边漏掉
   * 就永久卡住（2026-09-21 那次「点了筛选一直骨架屏」正是如此）。镜像没有这个失败模式
   * —— 每次状态变化都会把当前值报上去，网格落定就一定报 false。
   *
   * 也因此调用方**不应该**在点击时自己 startLoading：`/mods?sort=latest` 点「全部」这类
   * 导航，URL 变了但解析出来的筛选一模一样，queryKey 不变、不会发起任何请求，自己起的
   * 进度条就没人负责停。
   *
   * `loading` 覆盖「第一页还没到 / 正在用旧列表占位 / 侧栏工具栏乐观态」，但不跟翻页走：
   * 无限滚动时顶部闪一条进度条太吵。总数在 isPending 期间报 null（那时 data 是空的）
   * —— 上层据此不显示计数，而不是显示一个 0。
   *
   * `effectiveColumns` 给工具栏高亮用：非瀑布流（网格模式）报 null，让工具栏按老口径算。
   * 它必须跟 `colCount` 同步上报 —— 用户看到的列数就是这里算出来的那个。
   */
  useEffect(() => {
    onStatusChange?.({
      // 乐观加载态（侧栏/工具栏刚点下）也要让顶部进度条立刻亮着
      loading: isPending || pendingCharacter !== null || pendingListingLoad,
      totalCount: isPending ? null : (data?.pages[0]?.totalCount ?? null),
      effectiveColumns: isMasonry ? (colCount as MasonryColumns) : null,
    });
  }, [data, isPending, pendingCharacter, pendingListingLoad, onStatusChange, isMasonry, colCount]);

  const handleImageRatioChange = useCallback((modId: string, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    if (ratiosRef.current[modId] === ratio) return;
    pendingRatiosRef.current[modId] = ratio;
    if (ratioFlushTimerRef.current !== null) return;
    ratioFlushTimerRef.current = setTimeout(() => {
      ratioFlushTimerRef.current = null;
      const pending = pendingRatiosRef.current;
      pendingRatiosRef.current = {};
      if (Object.keys(pending).length === 0) return;
      Object.assign(ratiosRef.current, pending);
      setRatios((prev) => ({ ...prev, ...pending }));
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (ratioFlushTimerRef.current !== null) clearTimeout(ratioFlushTimerRef.current);
    },
    [],
  );

  /**
   * 直接量 DOM 的比例兜底 —— **不依赖 ModCard 的 `onImageRatioChange` 回调**。
   *
   * 实测（2026-10-20）：从首页客户端跳到 `/mods` 后，卡片的比例回调一次都没触发，
   * `ratios` 永远是空对象 ⇒ 全部按兜底 3/4 打包（每张卡预留 218px），而卡片实际按真实
   * 比例渲染（横图只有 80–120px 高）⇒ 每张横图下面空出一大块，要刷新页面才恢复。
   *
   * 这里在瀑布流容器上挂一个捕获阶段的 `load` 监听 + 挂载时扫一遍，直接从 `<img>` 的
   * naturalWidth/naturalHeight 取比例。只要图渲染出来了就一定量得到，与 React 的
   * 回调时序无关。`data-mod-id` 由渲染层写在卡片外层。
   */
  const masonryRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMasonry) return;
    const root = masonryRootRef.current;
    if (!root) return;

    const sync = () => {
      const found: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>("[data-mod-id]").forEach((el) => {
        const img = el.querySelector("img");
        const id = el.dataset.modId;
        if (!id || !img || !img.naturalWidth || !img.naturalHeight) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        if (Number.isFinite(ratio) && ratio > 0) found[id] = ratio;
      });
      if (Object.keys(found).length === 0) return;

      // 同时写回 ratiosRef：ModCard 之后补报同样的值时直接走去重，不再触发重排
      Object.assign(ratiosRef.current, found);

      setRatios((prev) => {
        let changed = false;
        for (const [id, ratio] of Object.entries(found)) {
          if (Math.abs((prev[id] ?? 0) - ratio) > 0.005) {
            changed = true;
            break;
          }
        }
        return changed ? { ...prev, ...found } : prev;
      });
    };

    sync();
    const onLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) sync();
    };
    root.addEventListener("load", onLoad, true);
    // 缓存命中的图可能在监听挂上之前就完成了，补一次延迟扫描
    const timer = setTimeout(sync, 400);

    return () => {
      root.removeEventListener("load", onLoad, true);
      clearTimeout(timer);
    };
  }, [isMasonry, mods]);

  /**
   * 瀑布流摆放：横屏（宽高比 > 1.1）横跨两列，其余卡片进当前最矮的列。
   * 高度公式见 masonry-packing.ts —— 卡片高度只由「列宽 + 图片比例」决定。
   */
  const masonryPack = useMemo(() => {
    if (!isMasonry || masonryWidth <= 0) return null;
    return packMasonry(packItems, colCount, masonryWidth);
  }, [isMasonry, masonryWidth, packItems, colCount]);

  const modById = useMemo(() => {
    const map = new Map<string, SiteMod>();
    mods.forEach((mod) => map.set(mod.id, mod));
    return map;
  }, [mods]);

  /**
   * 还没量到容器宽度时的兜底分列（按数量分到最短列，与改动前的版式一致）。
   * 只服务于 SSR 和水合首帧，量到宽度后立刻换成 masonryPack。
   *
   * 保留列归属记忆：兜底版式在水合期间也会随状态更新重渲染，没有记忆的话
   * 卡片会在列之间来回跳。
   */
  const fallbackColMapRef = useRef<{ colCount: number; map: Map<string, number> }>({
    colCount: -1,
    map: new Map(),
  });

  /* eslint-disable react-hooks/refs */
  const fallbackColumns = useMemo(() => {
    if (!isMasonry) return [];
    if (fallbackColMapRef.current.colCount !== colCount) {
      fallbackColMapRef.current = { colCount, map: new Map() };
    }
    const colMap = fallbackColMapRef.current.map;
    const cols: SiteMod[][] = Array.from({ length: colCount }, () => []);

    for (const mod of mods) {
      const prev = colMap.get(mod.id);
      if (prev !== undefined && prev < colCount) {
        cols[prev].push(mod);
        continue;
      }
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
    const colMap = fallbackColMapRef.current.map;
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
    (mod: SiteMod, idx: number, imageSizes: string = DEFAULT_CARD_IMAGE_SIZES) => (
      <ModCard
        mod={mod}
        href={gameKey ? `/${gameKey}/mods/${mod.id}` : `/mods/${mod.id}`}
        onCardClick={onCardClick}
        isLoggedIn={isLoggedIn}
        variant="list"
        className="bg-[var(--neo-panel)] p-2.5"
        imageAspectClassName={isMasonry ? "auto" : "aspect-[5/6] sm:aspect-[4/5]"}
        // 只 eager 第一页：后面几页若也 eager，会和首屏可见图片抢带宽，
        // 反而让当前屏更慢。后面的页保持 lazy，进入视口前由 2000px 数据预取兜住。
        imagePriority={idx < MODS_PAGE_SIZE}
        imageFetchPriority={idx < 4 ? "high" : idx < MODS_PAGE_SIZE ? "auto" : "low"}
        // 移动端是 2 列，单卡约 50vw；写 100vw 会让浏览器选 560 档，白花约一半字节。
        // 跨两列的横屏卡由调用方传入真实像素宽，见 DEFAULT_CARD_IMAGE_SIZES 的注释。
        imageSizes={imageSizes}
        // 瀑布流要靠真实宽高比算卡片高度、判定横屏跨列；网格版式固定比例，用不上
        onImageRatioChange={isMasonry ? (ratio) => handleImageRatioChange(mod.id, ratio) : undefined}
        mediaTopRight={
          mod.driveLinks.length > 0 ? (
            <CardDownloadAction driveLinks={mod.driveLinks} />
          ) : mod.downloadUrl ? (
            <span className="inline-flex items-center border-2 border-black bg-[var(--neo-success)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]">
              直链下载
            </span>
          ) : undefined
        }
        mediaTopRightClassName="absolute right-2 top-2"
      />
    ),
    [gameKey, onCardClick, isLoggedIn, isMasonry, handleImageRatioChange],
  );

  /**
   * 第一页还没到（换筛选、硬打开带筛选的 URL）→ 立即铺满整块骨架。
   *
   * `pendingCharacter` / `pendingListingLoad` 是**乐观的那一半**：点侧栏角色/工具栏
   * 筛选后、导航落地前就先把骨架亮起来，别让用户觉得点击没反应。
   */
  if (isPending || pendingCharacter !== null || pendingListingLoad) {
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
        <section className="neo-card-lg bg-[var(--neo-panel)] p-8 text-black">
          <div className="border-4 border-black bg-white px-5 py-6">
            <p className="neo-label text-black/60">没有匹配内容</p>
            <h2 className="mt-2 text-3xl font-black">当前筛选条件下还没有公开的外观资源。</h2>
            <p className="mt-4 text-sm font-bold leading-7 text-black/75">你可以切换角色、搜索关键词或排序方式继续浏览。</p>
          </div>
        </section>
      </MotionReveal>
    );
  }

  return (
    <div className="space-y-5">
      {/*
       * 放宽提示条。放在列表**上方**、不改动也不遮挡搜索框 —— 用户刚打完词，
       * 搜索框还在原地，只是结果换成了「部分匹配」。
       *
       * 必须说出来：搜「千咲 女仆」却看到一堆只有「千咲」的结果，如果没有任何解释，
       * 用户会以为搜索把「女仆」当耳旁风。样式沿用列表底部那条「已经翻到底了」。
       */}
      {relaxed ? (
        <div data-slot="search-relaxed-notice" className="flex flex-wrap items-center gap-2 border-4 border-black bg-[var(--neo-muted)] px-4 py-2.5 text-xs font-black shadow-[4px_4px_0px_0px_#000]">
          <Search className="size-4 shrink-0" />
          没有精确匹配的结果，以下是包含部分关键词的外观资源
        </div>
      ) : null}

      {isMasonry ? (
        /* 瀑布流：绝对定位摆放 —— 横屏卡要横跨两列，flex 分列做不到。
           没量到容器宽度时退回 flex 分列，见 attachMasonryContainer 的注释。 */
        <div
          ref={(node) => {
            attachMasonryContainer(node);
            masonryRootRef.current = node;
          }}
        >
          {masonryPack ? (
            <>
              <div className="relative" style={{ height: masonryPack.height }}>
                {masonryPack.placements.map((placement) => {
                  const mod = modById.get(placement.id);
                  if (!mod) return null;
                  const idx = modIndex.get(mod.id) ?? 0;
                  return (
                    <div
                      key={mod.id}
                      data-mod-id={mod.id}
                      className="absolute"
                      style={{
                        left: masonryColumnLeft(placement.column, masonryPack.columnWidth),
                        top: placement.top,
                        width: masonrySpanWidth(placement.span, masonryPack.columnWidth),
                      }}
                    >
                      <MotionReveal
                        delay={0.03 + (idx % 8) * 0.02}
                        y={14}
                        rotate={idx % 2 === 0 ? -1 : 1}
                      >
                        {/* `sizes` 用布局算出来的真实图片宽度（卡宽减掉边框与内边距），
                            而不是按 viewport 猜的 vw —— 横屏卡跨两列时后者会少算一半。 */}
                        {renderCard(
                          mod,
                          idx,
                          `${Math.round(
                            masonrySpanWidth(placement.span, masonryPack.columnWidth) - MASONRY_CARD_CHROME,
                          )}px`,
                        )}
                      </MotionReveal>
                    </div>
                  );
                })}
                {/* 哨兵：必须脱流（absolute），否则会占掉一格。挂在整块底部（= 最高列的
                    底）即可 —— rootMargin 的 800px 足够覆盖各列高度差（理由详见网格分支）。 */}
                {hasNextPage ? (
                  <div
                    ref={setSentinel}
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-0 size-px"
                  />
                ) : null}
              </div>
              {/* 加载中骨架：下一批卡片的文件还没到，算不出绝对坐标，
                  统一在瀑布流下方铺一组占位卡片 */}
              {isFetchingNextPage ? (
                <div className="mt-4 flex gap-4">
                  {Array.from({ length: colCount }).map((_, colIdx) => (
                    <div key={colIdx} className="flex flex-1 flex-col gap-4">
                      {Array.from({ length: Math.ceil(16 / colCount) }).map((_, si) => (
                        <MotionReveal key={`skel-${si}`} delay={0.05 + si * 0.03} y={10}>
                          <MasonryCardSkeleton index={colIdx * 3 + si} />
                        </MotionReveal>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            /* 未量到容器宽度（SSR / 水合首帧）的兜底版式 */
            <div className="flex gap-4">
              {fallbackColumns.map((col, colIdx) => (
                <div key={colIdx} className="relative flex flex-1 flex-col gap-4">
                  {col.map((mod) => {
                    const idx = modIndex.get(mod.id) ?? 0;
                    return (
                      <MotionReveal
                        key={mod.id}
                        data-mod-id={mod.id}
                        delay={0.03 + (idx % 8) * 0.02}
                        y={14}
                        rotate={idx % 2 === 0 ? -1 : 1}
                      >
                        {renderCard(mod, idx)}
                      </MotionReveal>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
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
          <div className="inline-flex items-center gap-3 border-4 border-black bg-[var(--neo-secondary)] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <Search className="size-4" />
            已经翻到底了，试试切换角色或搜索关键词
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="border-4 border-black bg-[#ffb5c3] px-5 py-4 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
          资源列表加载失败，请稍后重试。
        </div>
      ) : null}
    </div>
  );
}
