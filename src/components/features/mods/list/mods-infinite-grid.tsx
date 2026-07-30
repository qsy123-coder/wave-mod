"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Lock, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModCard } from "@/components/common/mod-card";
import { MasonryCardSkeleton, ModCardSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import type { ModSort, PaginatedResult, SiteMod } from "@/lib/mods";

const PAGE_SIZE = 16;

async function fetchModsPage({
  character,
  gameKey,
  page,
  query,
  sort,
}: {
  character?: string;
  gameKey?: string;
  page: number;
  query?: string;
  sort: ModSort;
}): Promise<PaginatedResult<SiteMod>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
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

  const response = await fetch(`/api/mods?${params.toString()}`);

  if (!response.ok) {
    throw new Error("加载 MOD 列表失败。");
  }

  return response.json();
}

type ModsInfiniteGridProps = {
  character?: string;
  gameKey?: string;
  initialMods: SiteMod[];
  query?: string;
  sort: ModSort;
  nsfwMode?: "show" | "blur" | "hide";
  directOnly?: boolean;
  nsfwOnly?: boolean;
  onCardClick?: (modId: string) => void;
  onCountChange?: (count: number) => void;
  isLoggedIn?: boolean;
  layoutMode?: "grid" | "masonry";
  masonryColumns?: number;
};

export function ModsInfiniteGrid({ character, gameKey, initialMods, query, sort, nsfwMode = "blur", directOnly = false, nsfwOnly = false, onCardClick, onCountChange, isLoggedIn = false, layoutMode = "masonry", masonryColumns }: ModsInfiniteGridProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const initialPage: PaginatedResult<SiteMod> = {
    hasMore: initialMods.length === PAGE_SIZE,
    items: initialMods,
    nextPage: initialMods.length === PAGE_SIZE ? 2 : null,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: initialMods.length > 0 ? 1 : 1,
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["mods", { character, gameKey, query, sort }],
    queryFn: ({ pageParam }) => fetchModsPage({ character, gameKey, page: pageParam, query, sort }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    initialData: {
      pageParams: [1],
      pages: [initialPage],
    },
    refetchOnWindowFocus: false,
  });

  const mods = useMemo(() => {
    let all = data.pages.flatMap((page) => page.items);
    if (nsfwOnly) all = all.filter((m) => m.nsfw);
    if (nsfwMode === "hide") all = all.filter((m) => !m.nsfw);
    if (directOnly) all = all.filter((m) => m.downloadUrl);
    return all;
  }, [data.pages, nsfwMode, directOnly, nsfwOnly]);

  useEffect(() => {
    onCountChange?.(mods.length);
  }, [mods.length, onCountChange]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // ==================== 瀑布流 JS 布局 ====================

  const isMasonry = layoutMode === "masonry";

  // 列数：用户手动选择优先，否则自动根据容器宽度计算
  const masonryRef = useRef<HTMLElement | null>(null);
  const [autoColCount, setAutoColCount] = useState(5);
  const colCount = masonryColumns ?? autoColCount;

  useEffect(() => {
    if (!isMasonry || masonryColumns) return;
    const el = masonryRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setAutoColCount(Math.max(1, Math.floor(w / 220)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMasonry, masonryColumns]);

  // 列归属记忆：mod.id → 列索引，保证已有卡片零抖动
  const colMap = useRef<Map<string, number>>(new Map());

  // 分配卡片到各列
  const columns = useMemo(() => {
    if (!isMasonry) return [];
    const cols: SiteMod[][] = Array.from({ length: colCount }, () => []);
    const seen = new Set<string>();

    for (const mod of mods) {
      seen.add(mod.id);
      const prev = colMap.current.get(mod.id);
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
      colMap.current.set(mod.id, shortest);
    }

    // 清理已移出列表的卡片
    if (colMap.current.size > seen.size * 2) {
      for (const id of colMap.current.keys()) {
        if (!seen.has(id)) colMap.current.delete(id);
      }
    }

    return cols;
  }, [mods, colCount, isMasonry]);

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
        imageClassName={mod.nsfw && nsfwMode === "blur" ? "blur-xl" : undefined}
        mediaTopRight={
          mod.nsfw || mod.downloadUrl ? (
            <div className="flex items-center gap-1">
              {mod.nsfw ? (
                <span className="inline-flex items-center border-2 border-black bg-[#bcaeff] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]">
                  NSFW
                </span>
              ) : null}
              {mod.downloadUrl ? (
                <span className="inline-flex items-center border-2 border-black bg-[#4ade80] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]">
                  直链下载
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        mediaTopRightClassName="absolute right-2 top-4"
        mediaBottomLeft={
          mod.nsfw && nsfwMode === "blur" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <Lock className="size-8 text-white drop-shadow-[2px_2px_0px_#000]" />
              <span className="border-2 border-black bg-black/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#ff7a7a] shadow-[2px_2px_0px_0px_#000]">
                可能含18+内容
              </span>
            </div>
          ) : undefined
        }
      />
    ),
    [gameKey, onCardClick, isLoggedIn, isMasonry, nsfwMode],
  );

  if (!isLoading && mods.length === 0) {
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
            <div key={colIdx} className="flex flex-1 flex-col gap-4">
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
              {/* 加载中骨架：每列底部一个占位卡片 */}
              {isFetchingNextPage ? (
                <MotionReveal key={`skel-${colIdx}`} delay={0.05} y={10}>
                  <MasonryCardSkeleton index={colIdx} />
                </MotionReveal>
              ) : null}
            </div>
          ))}
        </section>
      ) : (
        /* 网格：CSS grid 不变 */
        <section className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
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
          {/* 加载中骨架：一行 5 个占位卡片 */}
          {isFetchingNextPage
            ? Array.from({ length: 5 }).map((_, i) => (
                <MotionReveal key={`skel-${i}`} delay={0.05 + i * 0.02} y={10}>
                  <ModCardSkeleton />
                </MotionReveal>
              ))
            : null}
        </section>
      )}

      {error ? (
        <div className="border-4 border-black bg-[#ffb5c3] px-5 py-4 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
          MOD 列表加载失败，请稍后重试。
        </div>
      ) : null}

      {/* 哨兵元素：触发无限滚动，骨架卡片上方已显示加载状态 */}
      <div ref={sentinelRef} className="flex min-h-14 items-center justify-center">
        {!hasNextPage ? (
          <div className="inline-flex items-center gap-3 border-4 border-black bg-[#ffd84f] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <Search className="size-4" />
            已经翻到底了，试试切换角色或搜索关键词
          </div>
        ) : null}
      </div>
    </div>
  );
}
