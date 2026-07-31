import Link from "next/link";
import { Eye, Heart, Star } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { SiteMod } from "@/lib/mods";
import { GlowCard } from "@/components/ui/spotlight-card";

/** 根据索引提取徽章文案和类型 */
function getModBadge(_mod: SiteMod, index: number) {
  const tag = index % 3 === 0 ? "热门" : index % 3 === 1 ? "趋势" : "新作";
  const type = index % 2 === 0 ? "角色" : "服装";
  return { tag, type };
}

export function ZenlessModsCard({ game, index, mod }: { game: GameConfig; index: number; mod: SiteMod }) {
  const { tag, type } = getModBadge(mod, index);
  const tone = index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]";

  const card = (
    <Link href={`${game.nav.mods}/${mod.id}`} className="group block min-h-[136px] overflow-hidden border-4 border-black bg-black text-white shadow-[5px_5px_0_0_#000] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_#000]">
      <div className="relative h-[88px] overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mod.coverImage} alt="" loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mod.coverImage} alt={mod.title} loading="lazy" className="absolute inset-0 h-full w-full object-contain object-center transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/8 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black via-black/62 to-transparent" />
        <div className="absolute left-2 top-2 flex gap-1">
          <span className={`border-2 border-black px-2 py-0.5 text-[8px] font-black text-black shadow-[2px_2px_0_0_#000] ${tone}`}>{tag}</span>
          <span className="border-2 border-black bg-white px-2 py-0.5 text-[8px] font-black text-black shadow-[2px_2px_0_0_#000]">{type}</span>
        </div>
      </div>
      <div className="relative -mt-2 space-y-1 bg-black px-2.5 pb-2 pt-2.5">
        <div className="pointer-events-none absolute inset-x-0 -top-5 h-5 bg-gradient-to-t from-black to-transparent" />
        <p className="relative text-[8px] font-black uppercase tracking-[0.16em] text-white/58">{mod.character}</p>
        <h3 className="relative line-clamp-1 text-[9px] font-black uppercase leading-tight tracking-[0.16em] text-white/50 group-hover:text-white transition-colors">{mod.title.length > 8 ? `${mod.title.slice(0, 8)}...` : mod.title}</h3>
        <div className="relative flex items-center justify-between text-[8px] font-black uppercase text-white/76">
          <span className="inline-flex items-center gap-1"><Star className="size-3 fill-[#ffb000] text-[#ffb000]" />{mod.ratingAverage.toFixed(1)}</span>
          <span className="inline-flex items-center gap-1"><Heart className="size-3" />{(mod.favorites / 1000).toFixed(1)}K</span>
          <span className="inline-flex items-center gap-1"><Eye className="size-3" />{(mod.views / 1000).toFixed(1)}K</span>
        </div>
      </div>
    </Link>
  );

  return (
    <GlowCard glowColor="neo" customSize minimal radius={0}>
      {card}
    </GlowCard>
  );
}
