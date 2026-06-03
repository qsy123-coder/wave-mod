import Link from "next/link";

import type { GameConfig } from "@/config/games";
import type { SiteMod } from "@/lib/mods";
import {
  buildZenlessModsHref,
  toZenlessDisplayMod,
  zenlessCategories,
  zenlessCreators,
} from "./zenless-mods-data";

function RailPanel({
  children,
  href,
  title,
}: {
  children: React.ReactNode;
  href: string;
  title: string;
}) {
  return (
    <section className="border-4 border-black bg-[var(--neo-panel)] p-2 text-black shadow-[4px_4px_0_0_#000]">
      <div className="mb-5.5 flex items-center justify-between border-b-4 border-black pb-1.5">
        <h2 className="text-[9px] font-black uppercase tracking-[0.12em]">
          {title}
        </h2>
        <a href={href} className="text-[7px] font-black uppercase underline">
          View All
        </a>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function ZenlessModsRail({
  game,
  mods,
}: {
  game: GameConfig;
  mods: SiteMod[];
}) {
  return (
    <aside className="space-y-1.5">
      <RailPanel href={game.nav.mods} title="Popular Categories">
        {zenlessCategories.map(([Icon, label, query, count], index) => (
          <Link
            key={label}
            href={`${game.nav.mods}?query=${encodeURIComponent(query)}`}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 border-2 border-black bg-white px-1.5 py-1 shadow-[2px_2px_0_0_#000]"
          >
            <span
              className={`flex size-5 items-center justify-center border-2 border-black ${index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]"}`}
            >
              <Icon className="size-2.5" />
            </span>
            <span className="text-[9px] font-black">{label}</span>
            <span className="text-[8px] font-black text-black/55">{count}</span>
          </Link>
        ))}
      </RailPanel>
      <RailPanel href="/zenless-zone-zero/support" title="Top Creators">
        {zenlessCreators.map((name, index) => (
          <div
            key={name}
            className="grid grid-cols-[auto_auto_1fr] items-center gap-1.5"
          >
            <span className="flex size-5 items-center justify-center border-2 border-black bg-[var(--neo-secondary)] text-[8px] font-black">
              {index + 1}
            </span>
            <span
              className={`flex size-6 items-center justify-center rounded-full border-2 border-black text-[10px] font-black ${index % 2 ? "bg-[var(--neo-muted)]" : "bg-[var(--neo-accent)]"}`}
            >
              {name[0]}
            </span>
            <span>
              <span className="block truncate text-[11px] font-black">
                {name}
              </span>
              <span className="block text-[9px] font-bold text-black/55">
                {["15.6K", "12.1K", "9.8K", "8.7K", "7.2K"][index]} Followers
              </span>
            </span>
          </div>
        ))}
      </RailPanel>
      <RailPanel
        href={buildZenlessModsHref(game, "hot")}
        title="Trending This Week"
      >
        {mods.slice(0, 4).map((mod, index) => (
          <Link
            key={mod.id}
            href={`${game.nav.mods}/${mod.id}`}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 border-2 border-black bg-white p-1.5 shadow-[2px_2px_0_0_#000]"
          >
            <span className="text-[10px] font-black">{index + 1}</span>
            <span className="truncate text-[10px] font-black">
              {toZenlessDisplayMod(mod, index).title}
            </span>
            <span className="text-[8px] font-black">
              {Math.max(2.4, mod.views / 1000).toFixed(1)}K
            </span>
          </Link>
        ))}
      </RailPanel>
    </aside>
  );
}
