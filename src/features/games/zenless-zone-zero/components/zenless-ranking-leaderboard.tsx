"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Crown, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { SiteMod, TopCreator } from "@/lib/mods";

const panel =
  "border-4 border-black bg-white/30 shadow-[5px_5px_0px_0px_#000]";

const phRow = "grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1.5 sm:gap-2 border-2 border-black/20 px-1.5 sm:px-2 py-1.5 opacity-20";

type Tab = "mod-downloads" | "mod-likes" | "creator-followers" | "creator-reputation";
type Period = "all" | "month" | "week" | "today";

const TABS: { key: Tab; label: string; mobileLabel: string }[] = [
  { key: "mod-downloads", label: "MOD DOWNLOADS", mobileLabel: "Downloads" },
  { key: "mod-likes", label: "MOD LIKES", mobileLabel: "Likes" },
  { key: "creator-followers", label: "CREATOR FOLLOWERS", mobileLabel: "Followers" },
  { key: "creator-reputation", label: "CREATOR REPUTATION", mobileLabel: "Reputation" },
];

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 根据时间周期过滤 MOD/creator（基于 createdAt） */
function filterByPeriod<T extends { createdAt: string }>(items: T[], period: Period): T[] {
  if (period === "all") return items;
  const now = Date.now();
  const thresholds: Record<Period, number> = {
    all: 0,
    month: 30 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    today: 24 * 60 * 60 * 1000,
  };
  const cutoff = now - thresholds[period];
  return items.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-4 text-[#FACC15]" fill="#FACC15" />;
  if (rank === 2) return <Crown className="size-4 text-black" fill="#94A3B8" />;
  if (rank === 3) return <Crown className="size-4 text-amber-600" fill="#CD7F32" />;
  return (
    <span className="inline-flex size-5 items-center justify-center text-[10px] font-black text-black tabular-nums">
      {rank}
    </span>
  );
}

function TrendIndicator({ value, secondary }: { value: number; secondary: number }) {
  if (secondary === 0) return <span className="text-[10px] text-black">—</span>;
  const ratio = value / secondary;
  if (ratio > 1.2) return <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-green-400"><TrendingUp className="size-3" />+{((ratio - 1) * 100).toFixed(0)}%</span>;
  if (ratio < 0.8) return <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-red-400"><TrendingDown className="size-3" />{((ratio - 1) * 100).toFixed(0)}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-black"><TrendingUp className="size-3" />—</span>;
}

function ModRow({
  mod, rank, game, valueLabel, valueOf, avgDownloads,
}: {
  mod: SiteMod; rank: number; game: GameConfig; valueLabel: string;
  valueOf: (m: SiteMod) => number; avgDownloads: number;
}) {
  const hl = rank <= 3;
  return (
    <Link
      href={`${game.nav.mods}/${mod.id}`}
      className={`grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1.5 sm:gap-2 border-2 border-black px-1.5 sm:px-2 py-1.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 ${
        hl ? "bg-white/30" : "bg-black/5 hover:bg-[var(--neo-muted)]/40"
      }`}
    >
      <RankBadge rank={rank} />
      <span className="relative size-7 sm:size-8 shrink-0 overflow-hidden border-2 border-black bg-black">
        <Image src={mod.coverImage} alt={mod.title} fill sizes="32px" className="object-cover" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] sm:text-[11px] font-black text-black group-hover:text-[var(--neo-accent)] transition">
          {mod.title}
        </p>
        <p className="text-[8px] sm:text-[9px] font-bold text-black">{mod.character}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] sm:text-[11px] font-black text-black tabular-nums">{compact(valueOf(mod))}</p>
        <p className="text-[8px] font-bold uppercase text-black">{valueLabel}</p>
      </div>
      <span className="hidden sm:flex">
        <TrendIndicator value={valueOf(mod)} secondary={avgDownloads} />
      </span>
    </Link>
  );
}

function CreatorRow({
  creator, rank, game, valueLabel, valueOf,
}: {
  creator: TopCreator; rank: number; game: GameConfig; valueLabel: string;
  valueOf: (c: TopCreator) => number;
}) {
  const hl = rank <= 3;
  return (
    <Link
      href={`${game.nav.home}/creator/${creator.userId}`}
      className={`grid grid-cols-[auto_auto_1fr_auto] items-center gap-1.5 sm:gap-2 border-2 border-black px-1.5 sm:px-2 py-1.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 ${
        hl ? "bg-white/30" : "bg-black/5 hover:bg-[var(--neo-muted)]/40"
      }`}
    >
      <RankBadge rank={rank} />
      <span className="relative size-7 sm:size-8 shrink-0 overflow-hidden rounded-full border-2 border-black bg-black">
        {creator.avatarUrl ? (
          <Image src={creator.avatarUrl} alt={creator.displayName} fill sizes="32px" className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-xs font-black text-black">
            {creator.displayName.charAt(0)}
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] sm:text-[11px] font-black text-black group-hover:text-[var(--neo-accent)] transition">
          {creator.displayName}
          {rank <= 3 && <ShieldCheck className="ml-1 inline size-3 text-[var(--neo-accent)]" />}
        </p>
        <p className="text-[8px] sm:text-[9px] font-bold text-black">{creator.modCount} mods</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] sm:text-[11px] font-black text-black tabular-nums">{compact(valueOf(creator))}</p>
        <p className="text-[8px] font-bold uppercase text-black">{valueLabel}</p>
      </div>
    </Link>
  );
}

export function ZenlessRankingLeaderboard({
  game, mods, topCreators, period,
}: {
  game: GameConfig; mods: SiteMod[]; topCreators: TopCreator[]; period: Period;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("mod-downloads");

  // 时间过滤 + 排序
  const filteredMods = useMemo(() => filterByPeriod(mods, period), [mods, period]);
  const modsByDownloads = useMemo(() => [...filteredMods].sort((a, b) => b.downloads - a.downloads), [filteredMods]);
  const modsByLikes = useMemo(() => [...filteredMods].sort((a, b) => b.favorites - a.favorites), [filteredMods]);
  const avgDownloads = useMemo(() => {
    if (filteredMods.length === 0) return 0;
    return filteredMods.reduce((s, m) => s + m.downloads, 0) / filteredMods.length;
  }, [filteredMods]);

  const creatorsByDownloads = useMemo(() => [...topCreators].sort((a, b) => b.totalDownloads - a.totalDownloads), [topCreators]);
  const creatorsByMods = useMemo(() => [...topCreators].sort((a, b) => b.modCount - a.modCount), [topCreators]);

  const isModTab = activeTab === "mod-downloads" || activeTab === "mod-likes";
  const isCreatorTab = !isModTab;

  const isEmpty = (isModTab && filteredMods.length === 0) || (isCreatorTab && topCreators.length === 0);

  return (
    <section className={`${panel} flex flex-col overflow-hidden min-h-0 h-full`}>
      {/* Tabs */}
      <div className="flex overflow-x-auto border-b-2 border-black">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 border-r-2 border-black px-2.5 sm:px-3 py-2 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] transition ${
              activeTab === tab.key
                ? "bg-[var(--neo-accent)] text-black"
                : "bg-white/30 text-black hover:bg-[var(--neo-muted)]/60 hover:text-black"
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.mobileLabel}</span>
          </button>
        ))}
      </div>

      {/* Header */}
      {!isEmpty && (
        <div
          className={`hidden sm:grid items-center gap-2 border-b border-black/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-black ${
            isModTab ? "grid-cols-[auto_auto_1fr_auto_auto]" : "grid-cols-[auto_auto_1fr_auto]"
          }`}
        >
          <span className="w-5 text-center">#</span>
          <span />
          <span>{isModTab ? "MOD" : "CREATOR"}</span>
          <span className="text-right">
            {activeTab === "mod-downloads" ? "DL" : activeTab === "mod-likes" ? "Likes" : activeTab === "creator-followers" ? "Followers" : "Mods"}
          </span>
          {isModTab && <span className="text-right">Trend</span>}
        </div>
      )}

      {/* Rows */}
      <div className="flex-1 min-h-0 space-y-0.5 p-1 overflow-hidden">
        {activeTab === "mod-downloads" &&
          modsByDownloads.slice(0, 12).map((mod, i) => (
            <ModRow key={mod.id} mod={mod} rank={i + 1} game={game} valueLabel="DL" valueOf={(m) => m.downloads} avgDownloads={avgDownloads} />
          ))}
        {activeTab === "mod-likes" &&
          modsByLikes.slice(0, 12).map((mod, i) => (
            <ModRow key={mod.id} mod={mod} rank={i + 1} game={game} valueLabel="Likes" valueOf={(m) => m.favorites} avgDownloads={avgDownloads} />
          ))}
        {activeTab === "creator-followers" &&
          creatorsByDownloads.slice(0, 12).map((c, i) => (
            <CreatorRow key={c.userId} creator={c} rank={i + 1} game={game} valueLabel="Followers" valueOf={(c) => c.totalDownloads} />
          ))}
        {activeTab === "creator-reputation" &&
          creatorsByMods.slice(0, 12).map((c, i) => (
            <CreatorRow key={c.userId} creator={c} rank={i + 1} game={game} valueLabel="Mods" valueOf={(c) => c.modCount} />
          ))}
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={`ph-${i}`} className={phRow}>
            <span className="inline-flex size-5 items-center justify-center text-[10px] font-black text-black/20">{i + 1}</span>
            <span className="size-7 sm:size-8 shrink-0 border-2 border-black/20 bg-black/20" />
            <div><p className="text-[10px] font-black text-black/20">---</p></div>
            <div><p className="text-[10px] font-black text-black/20">---</p></div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="py-20 text-center">
          <p className="text-sm font-black text-black">
            {period !== "all" ? "No data for this time period" : "No data yet"}
          </p>
          <p className="mt-1 text-xs font-bold text-black">
            {period !== "all" ? "Try selecting &quot;All Time&quot; or check back later." : "Check back after more content is published."}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-between border-t-2 border-black px-2.5 py-1.5">
        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] text-black">
          {isModTab ? `${filteredMods.length} mods` : `${topCreators.length} creators`}
        </span>
        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] text-black">
          {period === "all" ? "ALL TIME" : period === "month" ? "THIS MONTH" : period === "week" ? "THIS WEEK" : "TODAY"}
        </span>
      </div>
    </section>
  );
}
