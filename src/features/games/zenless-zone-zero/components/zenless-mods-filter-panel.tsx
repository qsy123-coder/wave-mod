import Link from "next/link";
import { BarChart3, Filter } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { ModSort } from "@/lib/mods";
import { buildZenlessModsHref, zenlessAgents, zenlessSortOptions, zenlessTags } from "./zenless-mods-data";

function FilterGroup({ children, title }: { children: React.ReactNode; title: string }) {
  return <div><p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-black/55">{title}</p><div className="space-y-1.5">{children}</div></div>;
}

type ZenlessModsFilterPanelProps = {
  character?: string;
  game: GameConfig;
  query?: string;
  sort: ModSort;
};

export function ZenlessModsFilterPanel({ character, game, query, sort }: ZenlessModsFilterPanelProps) {
  return (
    <aside className="space-y-2">
      <section className="border-4 border-black bg-[var(--neo-panel)] p-3 text-black shadow-[6px_6px_0_0_#000]">
        <div className="mb-3 flex items-center justify-between border-b-4 border-black pb-2.5"><h2 className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em]"><Filter className="size-3.5" />筛选</h2><Link href={game.nav.mods} className="text-[8px] font-black uppercase underline">重置</Link></div>
        <div className="space-y-3.5">
          <FilterGroup title="角色分类">{zenlessAgents.map((agent, index) => <Link key={agent} href={index === 0 ? buildZenlessModsHref(game, sort, undefined, query) : buildZenlessModsHref(game, sort, agent, query)} className={`flex justify-between border-2 border-black px-2.5 py-1 text-[9px] font-black shadow-[2px_2px_0_0_#000] ${((index === 0 && !character) || character === agent) ? "bg-[var(--neo-accent)]" : index % 2 ? "bg-[var(--neo-secondary)]" : "bg-white"}`}><span>{agent}</span><span className="text-black/55">{index ? ["1,523", "986", "652", "412", "231", "143"][index - 1] : "2,647"}</span></Link>)}</FilterGroup>
          <FilterGroup title="排序方式">{zenlessSortOptions.map((item, index) => <Link key={item.value} href={buildZenlessModsHref(game, item.value, character, query)} className={`flex items-center gap-1.5 border-2 border-black px-2.5 py-1 text-[9px] font-black shadow-[2px_2px_0_0_#000] ${item.value === sort ? "bg-[var(--neo-muted)]" : index % 2 ? "bg-[var(--neo-secondary)]" : "bg-white"}`}><BarChart3 className="size-3.5" />{item.label}</Link>)}</FilterGroup>
          <FilterGroup title="标签"><div className="flex flex-wrap gap-2">{zenlessTags.map((tag, index) => <Link key={tag} href={buildZenlessModsHref(game, sort, character, tag === query ? undefined : tag)} className={`border-2 border-black px-2 py-1.5 text-[10px] font-black shadow-[3px_3px_0_0_#000] ${tag === query ? "bg-[var(--neo-accent)]" : index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-white"}`}>{tag}</Link>)}</div></FilterGroup>
        </div>
      </section>
    </aside>
  );
}
