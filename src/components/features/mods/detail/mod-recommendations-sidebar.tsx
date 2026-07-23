"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Compass, Download, Flame, Sparkles, Stars, X } from "lucide-react";

import { ModCard } from "@/components/common/mod-card";
import type { SiteMod } from "@/lib/mods";

type ModRecommendationsSidebarProps = {
  collapsedCount?: number;
  items: SiteMod[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  priorityCharacter: string;
};

function heatScore(mod: SiteMod) {
  return Math.round(mod.views * 0.35 + mod.downloads * 2.4 + mod.ratingAverage * 20 + mod.favorites * 1.8);
}

export function ModRecommendationsSidebar({
  items,
  collapsedCount = 6,
  onOpenChange,
  open,
  priorityCharacter,
}: ModRecommendationsSidebarProps) {
  const visibleItems = useMemo(() => {
    const sameCharacter = items.filter((item) => item.character === priorityCharacter);
    const others = items.filter((item) => item.character !== priorityCharacter);
    return [...sameCharacter, ...others].slice(0, collapsedCount);
  }, [collapsedCount, items, priorityCharacter]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (visibleItems.length === 0) return null;

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/18 transition-opacity duration-300 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
        <button type="button" onClick={() => onOpenChange(false)} className="h-full w-full" aria-label="关闭推荐模组遮罩" />
      </div>

      <aside
        className={`fixed right-3 top-4 bottom-4 z-50 flex border-4 border-black bg-[#FFFDF5] text-black shadow-[12px_12px_0px_0px_#000] transition-all duration-300 ease-in-out ${open ? "w-[356px] max-w-[88vw] -rotate-1" : "w-14 rotate-[0.5deg] opacity-80"}`}
        aria-label="推荐模组侧边面板"
      >
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={`flex w-14 shrink-0 flex-col items-center justify-between border-r-4 border-black py-3 transition ${open ? "bg-[#FFD93D]" : "bg-[#fff2b8] hover:-translate-y-0.5"}`}
          aria-expanded={open}
          aria-label={open ? "收起推荐模组面板" : "展开推荐模组面板"}
        >
          <div className={`inline-flex size-8 items-center justify-center border-4 border-black bg-white shadow-[3px_3px_0px_0px_#000] ${open ? "rotate-6" : "-rotate-3"}`}>
            <Flame className="size-3.5" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-3">
            <div className="inline-flex size-8 items-center justify-center border-4 border-black bg-[#C4B5FD] shadow-[3px_3px_0px_0px_#000]">
              <Compass className="size-3.5" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.18em] [writing-mode:vertical-rl]">推荐</span>
            {!open ? <Stars className="size-3.5" /> : null}
          </div>
          <div className={`inline-flex size-8 items-center justify-center border-4 border-black bg-white shadow-[3px_3px_0px_0px_#000] transition ${open ? "rotate-180" : "rotate-0"}`}>
            <ChevronLeft className="size-3.5" />
          </div>
        </button>

        <div className={`flex min-w-0 flex-1 flex-col transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="flex items-center justify-between border-b-4 border-black bg-[#FFD93D] px-3 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Hot Picks</p>
              <h2 className="mt-1 text-xl font-black uppercase">推荐模组</h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex size-8 items-center justify-center border-4 border-black bg-white shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none xl:hidden"
              aria-label="关闭推荐模组面板"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#FFFDF5] p-3">
            <div className="grid gap-3">
              {visibleItems.map((mod, index) => {
                const isPriority = mod.character === priorityCharacter;
                const cardBg = index % 3 === 0 ? "bg-white" : index % 3 === 1 ? "bg-[#C4B5FD]" : "bg-[#FF6B6B]";

                return (
                  <ModCard
                    key={mod.id}
                    mod={mod}
                    href={`/mods/${mod.id}`}
                    className={`${cardBg} p-2.5`}
                    imageAspectClassName="aspect-[4/3]"
                    mediaClassName="shadow-[3px_3px_0px_0px_#000]"
                    contentClassName="mt-2.5 space-y-2 px-0 pb-0 pt-0"
                    titleClassName="line-clamp-1 text-sm font-black leading-5"
                    showInteractionBar={false}
                    showMetaBadges={false}
                    showRatingSticker={false}
                    mediaTopLeftClassName="left-2 top-2"
                    mediaTopRightClassName="right-2 top-2"
                    mediaTopLeft={
                      <div className="inline-flex items-center gap-1 border-4 border-black bg-[#FFD93D] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000]">
                        <Flame className="size-3" />{heatScore(mod)}
                      </div>
                    }
                    mediaTopRight={isPriority ? (
                      <div className="inline-flex items-center gap-1 border-4 border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000]">
                        <Sparkles className="size-3" />优先
                      </div>
                    ) : null}
                    bodyAfterDescription={(
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`border-4 border-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000] ${isPriority ? "bg-[#FFD93D]" : "bg-white"}`}>
                            {mod.character}
                          </span>
                          <span className="border-4 border-black bg-[#FFFDF5] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000]">
                            {mod.version}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-black uppercase tracking-[0.12em]">
                          <div className="border-4 border-black bg-[#FFFDF5] px-2 py-1 shadow-[2px_2px_0px_0px_#000]">下 {mod.downloads}</div>
                          <div className="border-4 border-black bg-[#FFFDF5] px-2 py-1 shadow-[2px_2px_0px_0px_#000]">览 {mod.views}</div>
                        </div>
                      </>
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="border-t-4 border-black bg-[#FFD93D] p-3">
            <Link
              href="/mods?sort=hot"
              onClick={() => onOpenChange(false)}
              className="inline-flex w-full items-center justify-center gap-2 border-4 border-black bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Download className="size-3.5" />查看更多
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
