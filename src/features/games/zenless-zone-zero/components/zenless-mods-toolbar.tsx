import Link from "next/link";
import { Grid3X3, X } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { ModSort } from "@/lib/mods";
import { buildZenlessModsHref, zenlessSortOptions } from "./zenless-mods-data";

type ZenlessModsToolbarProps = {
  character?: string;
  game: GameConfig;
  query?: string;
  sort: ModSort;
};

export function ZenlessModsToolbar({ character, game, query, sort }: ZenlessModsToolbarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-4 border-black bg-white p-2.5 text-black shadow-[6px_6px_0_0_#000]">
        <div className="flex flex-wrap gap-2">
          {zenlessSortOptions.slice(0, 3).map((item, index) => (
            <Link key={item.value} href={buildZenlessModsHref(game, item.value, character, query)} className={`border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_0_#000] ${item.value === sort ? "bg-[var(--neo-accent)]" : index % 2 ? "bg-[var(--neo-muted)]" : "bg-[var(--neo-secondary)]"}`}>
              {item.label}
            </Link>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-black/58"><Grid3X3 className="size-4" />View Grid</span>
      </div>
      {character || query ? (
        <div className="flex flex-wrap gap-2">
          {character ? <span className="border-4 border-black bg-[var(--neo-secondary)] px-3 py-2 text-xs font-black shadow-[4px_4px_0_0_#000]">角色：{character}</span> : null}
          {query ? <span className="border-4 border-black bg-white px-3 py-2 text-xs font-black shadow-[4px_4px_0_0_#000]">关键词：{query}</span> : null}
          <Link href={game.nav.mods} className="inline-flex items-center gap-2 border-4 border-black bg-[var(--neo-accent)] px-3 py-2 text-xs font-black shadow-[4px_4px_0_0_#000]"><X className="size-3.5" />清除</Link>
        </div>
      ) : null}
    </>
  );
}
