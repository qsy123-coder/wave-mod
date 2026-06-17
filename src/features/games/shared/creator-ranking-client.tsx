"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Download, Medal, Package } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { TopCreator } from "@/lib/mods";

type SortMode = "downloads" | "mods";

function sortCreators(creators: TopCreator[], mode: SortMode): TopCreator[] {
  return [...creators].sort((a, b) =>
    mode === "downloads"
      ? b.totalDownloads - a.totalDownloads
      : b.modCount - a.modCount,
  );
}

function formatValue(mode: SortMode, creator: TopCreator): string {
  if (mode === "downloads") {
    return creator.totalDownloads >= 1000
      ? `${(creator.totalDownloads / 1000).toFixed(1)}K 下载`
      : `${creator.totalDownloads} 下载`;
  }
  return `${creator.modCount} 个 MOD`;
}

export function CreatorRankingClient({
  creators,
  game,
}: {
  creators: TopCreator[];
  game: GameConfig;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("downloads");
  const sorted = sortCreators(creators, sortMode);

  return (
    <section className="neo-card bg-[var(--neo-panel)] p-5 text-black">
      {/* 标题 + 维度切换 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
          <Medal className="size-4" />
          创作者排行榜
        </div>

        {/* 维度切换标签 */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSortMode("downloads")}
            className={`inline-flex items-center gap-1.5 border-3 border-black px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5 ${
              sortMode === "downloads"
                ? "bg-[var(--neo-accent)] text-black"
                : "bg-white text-black/50"
            }`}
          >
            <Download className="size-3.5" />
            按下载量
          </button>
          <button
            type="button"
            onClick={() => setSortMode("mods")}
            className={`inline-flex items-center gap-1.5 border-3 border-black px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5 ${
              sortMode === "mods"
                ? "bg-[var(--neo-accent)] text-black"
                : "bg-white text-black/50"
            }`}
          >
            <Package className="size-3.5" />
            按 MOD 数
          </button>
        </div>
      </div>

      {/* Top 3 领奖台 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {sorted.slice(0, 3).map((creator, index) => {
          const medals = [
            "bg-[var(--neo-accent)] text-black",
            "bg-[#c0c0c0] text-black",
            "bg-[#cd7f32] text-black",
          ];
          return (
            <Link
              key={creator.userId}
              href={`${game.nav.home}/creator/${creator.userId}`}
              className={`group flex flex-col items-center gap-3 border-4 border-black p-4 shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-1 ${medals[index] ?? "bg-white"}`}
            >
              <span className="inline-flex size-10 items-center justify-center rounded-full border-3 border-black bg-white text-lg font-black shadow-[2px_2px_0_0_#000]">
                {index + 1}
              </span>
              {/* 头像：首字兜底 */}
              <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-full border-3 border-black bg-[#fafafa] shadow-[3px_3px_0_0_#000]">
                {creator.avatarUrl ? (
                  <Image
                    src={creator.avatarUrl}
                    alt={creator.displayName}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-2xl font-black text-black/40">
                    {creator.displayName.charAt(0)}
                  </span>
                )}
              </span>
              <div className="text-center">
                <p className="text-base font-black group-hover:underline">
                  {creator.displayName}
                </p>
                <p className="mt-0.5 text-xs font-bold text-black/60">
                  {creator.modCount} 个 MOD
                </p>
                <p className="mt-0.5 text-sm font-black">
                  {formatValue(sortMode, creator)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 4-20 名列表 */}
      {sorted.length > 3 && (
        <div className="grid gap-2">
          {sorted.slice(3).map((creator, index) => (
            <Link
              key={creator.userId}
              href={`${game.nav.home}/creator/${creator.userId}`}
              className="grid items-center gap-3 border-3 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
            >
              <span className="inline-flex size-8 items-center justify-center border-3 border-black bg-[#e5e7eb] text-xs font-black">
                {index + 4}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="relative size-7 shrink-0 overflow-hidden rounded-full border-2 border-black bg-[#f5f5f5]">
                  {creator.avatarUrl ? (
                    <Image
                      src={creator.avatarUrl}
                      alt={creator.displayName}
                      fill
                      sizes="28px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-[10px] font-black text-black/40">
                      {creator.displayName.charAt(0)}
                    </span>
                  )}
                </span>
                <span className="truncate text-sm font-black">
                  {creator.displayName}
                </span>
              </span>
              <span className="text-xs font-bold text-black/60">
                {creator.modCount} MOD
              </span>
              <span className="text-sm font-black">
                {formatValue(sortMode, creator)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
