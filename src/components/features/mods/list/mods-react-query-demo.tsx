"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { LoaderCircle, Trophy } from "lucide-react";

import { ModInteractionBar, RatingSticker } from "@/components/layout/mod-interaction-bar";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import type { ModSort, PaginatedResult, SiteMod } from "@/lib/mods";

const PAGE_SIZE = 12;

async function fetchModsPage(url: string): Promise<PaginatedResult<SiteMod>> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("加载 React Query 示例失败。");
  }

  return response.json();
}

type ModsReactQueryDemoProps = {
  character?: string;
  query?: string;
  sort: ModSort;
};

export function ModsReactQueryDemo({ character, query, sort }: ModsReactQueryDemoProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    initialPageParam: 1,
    queryKey: ["mods-react-query-demo", character ?? "all", query ?? "", sort],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        sort,
      });

      if (character) {
        params.set("character", character);
      }

      if (query) {
        params.set("query", query);
      }

      return fetchModsPage(`/api/mods?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    refetchOnWindowFocus: false,
  });

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
      { rootMargin: "360px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const mods = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  return (
    <section className="neo-card-lg bg-[#bcaeff] p-5 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="neo-label text-black/60">React Query v5 示例</p>
          <h2 className="mt-2 text-2xl font-black">同一套角色分类接口的无限滚动对照版</h2>
        </div>
        <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
          <Trophy className="size-4" />
          共载入 {mods.length} 个 MOD
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {mods.slice(0, 6).map((mod, index) => (
          <MotionReveal key={`rq-${mod.id}-${index}`} delay={0.04 + index * 0.03} y={16} rotate={index % 2 === 0 ? -1 : 1}>
            <Link href={`/mods/${mod.id}`} className="block">
              <article className="neo-card bg-white p-3">
                <div className="relative overflow-hidden border-4 border-black bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mod.coverImage} alt={mod.title} loading="lazy" decoding="async" className="h-44 w-full object-cover" />
                  <RatingSticker ratingAverage={mod.ratingAverage} ratingCount={mod.ratingCount} />
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="neo-sticker bg-[#ffd84f] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[#ffd84f]">{mod.character}</Badge>
                    <Badge className="neo-sticker bg-[#ff7a7a] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[#ff7a7a]">浏览 {mod.views}</Badge>
                  </div>
                  <h3 className="text-lg font-black leading-tight">{mod.title}</h3>
                  <ModInteractionBar mod={mod} />
                </div>
              </article>
            </Link>
          </MotionReveal>
        ))}
      </div>

      <div ref={sentinelRef} className="mt-5 flex items-center justify-center">
        <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
          <LoaderCircle className={`size-4 ${isFetchingNextPage ? "animate-spin" : ""}`} />
          {hasNextPage ? "滑到底部继续自动加载示例" : "React Query 示例已加载完成"}
        </div>
      </div>
    </section>
  );
}
