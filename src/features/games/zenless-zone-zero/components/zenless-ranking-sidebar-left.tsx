"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";

import type { GameConfig } from "@/config/games";

const panel =
  "border-4 border-black bg-[#07111f]/25 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10";

const timePeriods = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "month" },
  { label: "This Week", value: "week" },
  { label: "Today", value: "today" },
];

type Props = {
  game: GameConfig;
  categories: string[];
  activeCategory: string;
  period: string;
  compact?: boolean;
};

export function ZenlessRankingSidebarLeft({
  game,
  categories,
  activeCategory,
  period,
  compact: isCompact,
}: Props) {
  const base = game.nav.ranking ?? `${game.nav.home}/ranking`;

  // Mobile compact mode: single row of filters
  if (isCompact) {
    return (
      <div className="flex w-full gap-2 overflow-x-auto pb-1">
        <select
          value={activeCategory}
          onChange={(e) => {
            const v = e.target.value;
            window.location.href = v ? `${base}?character=${encodeURIComponent(v)}` : base;
          }}
          className="shrink-0 border-2 border-black bg-[#050914] px-3 py-2 text-[11px] font-bold text-white outline-none"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => {
            const v = e.target.value;
            window.location.href = v === "all" ? base : `${base}?period=${v}`;
          }}
          className="shrink-0 border-2 border-black bg-[#050914] px-3 py-2 text-[11px] font-bold text-white outline-none"
        >
          {timePeriods.map((tp) => (
            <option key={tp.value} value={tp.value}>{tp.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <aside className="space-y-3">
      {/* Categories */}
      <section className={`${panel} p-2.5 backdrop-blur-[2px]`}>
        <h3 className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
          Categories
        </h3>
        <nav className="space-y-0.5">
          <Link
            href={base}
            className={`flex items-center gap-1.5 border-2 border-black px-2 py-1.5 text-[10px] font-bold shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 ${
              !activeCategory
                ? "bg-[var(--neo-accent)] text-black"
                : "bg-[#050914]/30 text-slate-400 hover:bg-[#0a1220]/50"
            }`}
          >
            <LayoutGrid className="size-3" />
            All Categories
          </Link>
          {categories.slice(0, 8).map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <Link
                key={cat}
                href={`${base}?character=${encodeURIComponent(cat)}`}
                className={`block border-2 border-black px-2 py-1.5 text-[10px] font-bold shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 ${
                  isActive
                    ? "bg-[var(--neo-accent)] text-black"
                    : "bg-[#050914]/30 text-slate-400 hover:bg-[#0a1220]/50 hover:text-slate-300"
                }`}
              >
                {cat}
              </Link>
            );
          })}
        </nav>
      </section>

      {/* Time Period */}
      <section className={`${panel} p-2.5 backdrop-blur-[2px]`}>
        <h3 className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
          Time Period
        </h3>
        <nav className="space-y-0.5">
          {timePeriods.map((tp) => {
            const isActive = period === tp.value;
            const href = tp.value === "all" ? base : `${base}?period=${tp.value}`;
            return (
              <Link
                key={tp.value}
                href={href}
                className={`block border-2 border-black px-2 py-1.5 text-[10px] font-bold shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 ${
                  isActive
                    ? "bg-[var(--neo-accent)] text-black"
                    : "bg-[#050914]/30 text-slate-400 hover:bg-[#0a1220]/50 hover:text-slate-300"
                }`}
              >
                {tp.label}
              </Link>
            );
          })}
        </nav>
      </section>
    </aside>
  );
}
