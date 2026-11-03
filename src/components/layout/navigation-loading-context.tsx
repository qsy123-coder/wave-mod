"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";

type NavigationLoadingContextType = {
  /** 当前是否正在导航加载中（骨架屏 + 进度条显示中） */
  isLoading: boolean;
  /** 标记导航开始（点击筛选/排序时调用） */
  startLoading: () => void;
  /** 标记导航结束（服务端数据到达时自动调用） */
  stopLoading: () => void;
  /** 乐观角色：用户在侧边栏/其他处选中但尚未经服务端 props 确认的角色（null 表示全部/无角色） */
  pendingCharacter: string | null;
  /** 设置乐观角色，数据到达后应清空以对齐服务端 */
  setPendingCharacter: (character: string | null) => void;
  /**
   * 乐观列表加载：工具栏点了排序/筛选/搜索、导航还没落地（服务端 props 还没回来）的
   * 那一小段。与 pendingCharacter 同一个理由，由网格**加算**进骨架条件。
   */
  pendingListingLoad: boolean;
  /** 设置乐观列表加载态，服务端 props 落地后应清空 */
  setPendingListingLoad: (pending: boolean) => void;
  /** 是否正在跨页导航（顶部导航点击等），用于站点级骨架屏 */
  isPageLoading: boolean;
  /**
   * 正在导航去的目标路径（形如 `/mods?character=心月狐`，未在加载中时为 null）。
   *
   * `PageLoadingOverlay` 靠它挑「目标页面自己的那套骨架」—— 图库是暗色沉浸网格、
   * 问题解答是可拖拽双栏、每日更新带日期侧栏，用同一套网格骨架会明显对不上版。
   */
  pendingPagePath: string | null;
  /**
   * 标记跨页导航开始（顶部导航链接点击时调用）。
   * @param targetPath 目标 href。给了才能按页面选骨架；不给则回落到通用骨架。
   */
  startPageLoading: (targetPath?: string) => void;
  /** 标记跨页导航结束（目标路由确认时自动调用） */
  stopPageLoading: () => void;
};

const NavigationLoadingContext = createContext<NavigationLoadingContextType>({
  isLoading: false,
  startLoading: () => {},
  stopLoading: () => {},
  pendingCharacter: null,
  setPendingCharacter: () => {},
  pendingListingLoad: false,
  setPendingListingLoad: () => {},
  isPageLoading: false,
  pendingPagePath: null,
  startPageLoading: () => {},
  stopPageLoading: () => {},
});

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext);
}

/**
 * 跨页骨架的看门狗上限。
 *
 * `PageLoadingOverlay` 是 `fixed inset-0`、**会挡住内容区的点击**，所以「起了加载却没有
 * 真的导航」这种情形必须有个兜底，否则整页被锁到用户手动刷新。实测本站弱网下跨洋导航
 * 最长到过 40 秒（2026-10-16），所以上限给得比它宽裕 —— 正常导航会在 `RouteChangeListener`
 * 里路由一变就立刻收掉，根本够不到这个值。
 */
const PAGE_LOADING_WATCHDOG_MS = 60_000;

export function NavigationLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCharacter, setPendingCharacter] = useState<string | null>(null);
  const [pendingListingLoad, setPendingListingLoadState] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pendingPagePath, setPendingPagePath] = useState<string | null>(null);
  const pageWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);

  /**
   * 乐观角色：侧栏点下角色的**那一刻**写入，导航落地后由侧栏自己清掉。
   *
   * 为什么不能用 `isLoading` 承担这件事：那是网格独有的写入口（`handleStatusChange`），
   * 别处写会被它下一次回报**当场覆盖** —— 实测过，写了等于没写。
   * 所以乐观值走独立的状态，由消费方（网格）**加算**进加载态，两边互不打架。
   *
   * 看门狗：万一导航没落地（点了却因为某种原因没跳成），不能让右侧骨架一直挂着。
   */
  const pendingCharWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPendingCharacterSafe = useCallback((character: string | null) => {
    if (pendingCharWatchdog.current) {
      clearTimeout(pendingCharWatchdog.current);
      pendingCharWatchdog.current = null;
    }
    setPendingCharacter(character);
    if (character !== null) {
      pendingCharWatchdog.current = setTimeout(() => {
        pendingCharWatchdog.current = null;
        setPendingCharacter(null);
      }, PAGE_LOADING_WATCHDOG_MS);
    }
  }, []);

  /**
   * 乐观列表加载：工具栏点下排序/筛选/搜索的**那一刻**写入，本页服务端 props 落地后
   * 由工具栏自己清掉（见 mods-toolbar 的 markFilterNavigation）。
   *
   * 与 pendingCharacter 同一个理由：网格的 isLoading 要等 queryKey 变（= 客户端导航把
   * RSC 拿回来、URL 更新）才开始，在那之前点排序/筛选右侧完全没反应（用户报告：
   * 「点筛选/排序不如点左侧角色跟手」）。**不写 isLoading** —— 那是网格独有的写入口，
   * 别处写会被 handleStatusChange 当场覆盖（实测过）。
   *
   * 看门狗：万一导航没落地（点了却因为某种原因没跳成），不能让右侧骨架一直挂着。
   */
  const pendingListingWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPendingListingLoad = useCallback((pending: boolean) => {
    if (pendingListingWatchdog.current) {
      clearTimeout(pendingListingWatchdog.current);
      pendingListingWatchdog.current = null;
    }
    setPendingListingLoadState(pending);
    if (pending) {
      pendingListingWatchdog.current = setTimeout(() => {
        pendingListingWatchdog.current = null;
        setPendingListingLoadState(false);
      }, PAGE_LOADING_WATCHDOG_MS);
    }
  }, []);

  const stopPageLoading = useCallback(() => {
    if (pageWatchdog.current) {
      clearTimeout(pageWatchdog.current);
      pageWatchdog.current = null;
    }
    setIsPageLoading(false);
    setPendingPagePath(null);
  }, []);

  const startPageLoading = useCallback((targetPath?: string) => {
    setIsPageLoading(true);
    setPendingPagePath(targetPath ?? null);
    // 重复点击要重新计时，否则第二次点击会沿用第一次的剩余时间、提前收掉
    if (pageWatchdog.current) clearTimeout(pageWatchdog.current);
    pageWatchdog.current = setTimeout(() => {
      pageWatchdog.current = null;
      setIsPageLoading(false);
      setPendingPagePath(null);
    }, PAGE_LOADING_WATCHDOG_MS);
  }, []);

  // 卸载时清掉定时器，别让它在没有 Provider 的树上触发 setState
  useEffect(
    () => () => {
      if (pageWatchdog.current) clearTimeout(pageWatchdog.current);
      if (pendingCharWatchdog.current) clearTimeout(pendingCharWatchdog.current);
      if (pendingListingWatchdog.current) clearTimeout(pendingListingWatchdog.current);
    },
    [],
  );

  return (
    <NavigationLoadingContext.Provider
      value={{ isLoading, startLoading, stopLoading, pendingCharacter, setPendingCharacter: setPendingCharacterSafe, pendingListingLoad, setPendingListingLoad, isPageLoading, pendingPagePath, startPageLoading, stopPageLoading }}
    >
      {children}
    </NavigationLoadingContext.Provider>
  );
}
