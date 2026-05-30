import Link from "next/link";

import type { SiteMod } from "@/lib/mods-domain/types";

const staticUpdates = [
  { icon: "🔔", title: "Version 2.3.1 Released", desc: "New features and optimizations", time: "Just now", badge: "NEW" },
  { icon: "👤", title: "New Character Mods", desc: "Jinhsi, Yinlin and more", time: "5h ago", badge: null },
  { icon: "⚔️", title: "Weapon Pack Updated", desc: "10 new weapons added", time: "1d ago", badge: null },
  { icon: "🔧", title: "Bug Fixes & Improvements", desc: "Fixed 15 issues", time: "3d ago", badge: null },
] as const;

const updateIcons = ["🔔", "👤", "⚔️", "🔧"];

const categories = [
  { icon: "👤", name: "Character", count: "1,323" },
  { icon: "👗", name: "Outfit / Skin", count: "986" },
  { icon: "⚔️", name: "Weapon", count: "652" },
  { icon: "🖥️", name: "UI / Visual", count: "412" },
  { icon: "🎮", name: "Gameplay", count: "231" },
  { icon: "🎵", name: "Audio", count: "143" },
];

export function WuwaLatestUpdatesSidebar({ mods }: { mods: SiteMod[] }) {
  const updates = mods.length > 0
    ? mods.slice(0, 4).map((mod, index) => ({
        icon: updateIcons[index % updateIcons.length],
        title: mod.title,
        desc: mod.character,
        time: "Recently",
        badge: index === 0 ? "NEW" : null,
      }))
    : staticUpdates;

  return (
    <div className="rounded-lg border border-white/5 bg-[#161b22] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Latest Updates</h3>
        <Link href="/mods?sort=latest" className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 hover:text-blue-300">View All</Link>
      </div>
      <div className="space-y-2.5">
        {updates.map((update, index) => (
          <div key={`${update.title}-${index}`} className="flex items-start gap-3">
            <div className="flex size-8 flex-shrink-0 items-center justify-center rounded bg-[#1e2530] text-sm">{update.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-white">{update.title}</p>
                {update.badge ? <span className="flex-shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">{update.badge}</span> : null}
              </div>
              <p className="truncate text-[10px] text-slate-500">{update.desc}</p>
            </div>
            <span className="flex-shrink-0 text-[10px] text-slate-600">{update.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WuwaPopularCategoriesSidebar() {
  return (
    <div className="rounded-lg border border-white/5 bg-[#161b22] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Popular Categories</h3>
        <Link href="/mods" className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 hover:text-blue-300">View All</Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {categories.map((category) => (
          <Link key={category.name} href={`/mods?character=${encodeURIComponent(category.name)}`} className="flex items-center gap-2 rounded border border-white/5 bg-[#1e2530] px-3 py-2.5 transition hover:border-white/15 hover:bg-[#252d3a]">
            <span className="text-sm">{category.icon}</span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-white">{category.name}</p>
              <p className="text-[10px] text-slate-500">{category.count} mods</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
