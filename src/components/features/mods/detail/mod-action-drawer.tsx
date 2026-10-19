"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Download, Heart } from "lucide-react";

import type { DriveLink } from "@/lib/mods-domain/types";

import { DownloadButton } from "./download-button";
import { FavoriteButton } from "./favorite-button";

type ModActionDrawerProps = {
  downloadUrl: string | null;
  downloads: number;
  driveLinks: DriveLink[];
  isFavorited: boolean;
  isLoggedIn: boolean;
  modId: string;
  nextPath: string;
  onExpandedChange: (expanded: boolean) => void;
  title: string;
};

export function ModActionDrawer({
  downloadUrl,
  downloads,
  driveLinks,
  isFavorited,
  isLoggedIn,
  modId,
  nextPath,
  onExpandedChange,
  title,
}: ModActionDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    onExpandedChange(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    const handleOpen = () => setExpanded(true);
    window.addEventListener("wavemod:open-action-dock", handleOpen as EventListener);
    return () => window.removeEventListener("wavemod:open-action-dock", handleOpen as EventListener);
  }, []);

  return (
    <aside
      className={`fixed left-4 top-5 z-50 border-4 border-black bg-[#FFFDF5] text-black shadow-[10px_10px_0px_0px_#000] transition-all duration-300 ease-in-out ${expanded ? "w-[274px] -rotate-1" : "w-14 rotate-[0.5deg] opacity-82"}`}
      aria-label="资源操作面板"
    >
      <div className={`flex items-start justify-between border-b-4 border-black px-2.5 py-2.5 ${expanded ? "bg-[#FFD93D]" : "bg-[#fff2b8]"}`}>
        <div className={`min-w-0 transition-all duration-200 ${expanded ? "opacity-100" : "pointer-events-none w-0 opacity-0"}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Action Dock</p>
          <h2 className="mt-1 truncate text-sm font-black uppercase">资源面板</h2>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`inline-flex size-8 shrink-0 items-center justify-center border-4 border-black bg-white shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${expanded ? "rotate-180" : "rotate-0"}`}
          aria-label={expanded ? "折叠操作面板" : "展开操作面板"}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-2.5 p-2.5">
          <section className="border-4 border-black bg-white p-2.5 shadow-[5px_5px_0px_0px_#000]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">当前作品</p>
            <h3 className="mt-1.5 line-clamp-2 text-sm font-black leading-5">{title}</h3>
          </section>

          <section className="border-4 border-black bg-[#FF6B6B] p-2.5 shadow-[5px_5px_0px_0px_#000]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">核心操作</p>
            <div className="mt-2.5 grid gap-2">
              <DownloadButton compact modId={modId} downloadUrl={downloadUrl} downloadCount={downloads} driveLinks={driveLinks} />
              <FavoriteButton compact id={modId} isFavorited={isFavorited} isLoggedIn={isLoggedIn} nextPath={nextPath} favoriteLabel="收藏" unfavoriteLabel="已收藏" loginLabel="登录收藏" />
            </div>
          </section>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 border-t-4 border-black bg-white/90 px-1.5 py-2.5">
          <div className="inline-flex size-8 items-center justify-center border-4 border-black bg-[#FFD93D] shadow-[3px_3px_0px_0px_#000]"><Download className="size-3.5" /></div>
          <div className="inline-flex size-8 items-center justify-center border-4 border-black bg-[#FF6B6B] shadow-[3px_3px_0px_0px_#000]"><Heart className="size-3.5" /></div>
        </div>
      )}
    </aside>
  );
}
