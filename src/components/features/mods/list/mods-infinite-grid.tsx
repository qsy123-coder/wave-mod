"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { ModCard } from "@/components/common/mod-card";
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
};

export function ModsInfiniteGrid({ character, gameKey, initialMods, query, sort }: ModsInfiniteGridProps) {
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

  const mods = useMemo(() => data.pages.flatMap((page) => page.items), [data.pages]);

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
      <section className="grid w-full auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {mods.map((mod, index) => (
          <MotionReveal key={`${mod.id}-${index}`} delay={0.03 + (index % 8) * 0.02} y={14} rotate={index % 2 === 0 ? -1 : 1}>
            <ModCard
              mod={mod}
              href={gameKey ? `/${gameKey}/mods/${mod.id}` : `/mods/${mod.id}`}
              variant="list"
              className="bg-[#fff8ef] p-2.5"
              imageAspectClassName="aspect-[5/6] sm:aspect-[4/5]"
              imagePriority={index < 4}
              imageFetchPriority={index < 4 ? "high" : "auto"}
              imageSizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            />
          </MotionReveal>
        ))}
      </section>

      {error ? (
        <div className="border-4 border-black bg-[#ffb5c3] px-5 py-4 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
          MOD 列表加载失败，请稍后重试。
        </div>
      ) : null}

      <div ref={sentinelRef} className="flex min-h-14 items-center justify-center">
        {hasNextPage ? (
          <div className="inline-flex items-center gap-3 border-4 border-black bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <LoaderCircle className={`size-4 ${isFetchingNextPage ? "animate-spin" : ""}`} />
            {isFetchingNextPage ? "正在加载更多 MOD" : "继续下滑，自动加载更多"}
          </div>
        ) : (
          <div className="inline-flex items-center gap-3 border-4 border-black bg-[#ffd84f] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <Search className="size-4" />
            已经翻到底了，试试切换角色或搜索关键词
          </div>
        )}
      </div>
    </div>
  );
}
