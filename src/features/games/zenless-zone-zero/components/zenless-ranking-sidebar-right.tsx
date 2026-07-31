import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Trophy } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { SiteMod, TopCreator } from "@/lib/mods";


const panel =
  "border-4 border-black bg-white/30 shadow-[5px_5px_0px_0px_#000]";

const phClass = "flex items-center gap-1.5 border-2 border-black/20 p-1.5 opacity-20";

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ZenlessRankingSidebarRight({
  game,
  topCreators,
  trendingMods,
}: {
  game: GameConfig;
  topCreators: TopCreator[];
  trendingMods: SiteMod[];
}) {
  return (
    <aside className="flex flex-col gap-3 h-full">
      {/* Top Creators */}
      <section className={`${panel} flex flex-col flex-1 min-h-0 p-2.5`}>
        <div className="mb-2 shrink-0 flex items-center justify-between">
          <h3 className="text-[9px] font-black uppercase tracking-[0.14em] text-black">
            Top Creators
          </h3>
          <Link
            href={game.nav.ranking ?? `${game.nav.home}/ranking`}
            className="text-[8px] font-black text-[var(--neo-accent)] hover:underline"
          >
            VIEW ALL
          </Link>
        </div>
        <div className="flex-1 min-h-0 space-y-1.5 overflow-hidden">
          {topCreators.slice(0, 5).map((creator, index) => (
            <Link
              key={creator.userId}
              href={`${game.nav.home}/creator/${creator.userId}`}
              className="flex items-center gap-1.5 border-2 border-black bg-white/30 p-1.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 group"
            >
              <span className="flex size-4 shrink-0 items-center justify-center border-2 border-black bg-[var(--neo-accent)] text-[8px] font-black text-black">
                {index + 1}
              </span>
              <span className="relative size-6 shrink-0 overflow-hidden rounded-full border-2 border-black bg-black">
                {creator.avatarUrl ? (
                  <Image src={creator.avatarUrl} alt={creator.displayName} fill sizes="28px" className="object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-[10px] font-black text-black">
                    {creator.displayName.charAt(0)}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-black text-black group-hover:text-[var(--neo-accent)] transition">
                  {creator.displayName}
                </p>
                <p className="text-[8px] font-bold text-black">
                  {compact(creator.totalDownloads)} Followers{" "}
                  {index < 3 && <ShieldCheck className="inline size-2.5 text-[var(--neo-accent)]" />}
                </p>
              </div>
            </Link>
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={`ph-cr-${i}`} className={phClass}><span className="text-[10px] font-black text-black/20">---</span></div>
          ))}
        </div>
      </section>

      {/* Trending Mods */}
      <section className={`${panel} flex flex-col flex-1 min-h-0 p-2.5`}>
        <div className="mb-2 shrink-0 flex items-center justify-between">
          <h3 className="text-[9px] font-black uppercase tracking-[0.14em] text-black">
            Trending Mods
          </h3>
          <Link
            href={`${game.nav.mods}?sort=hot`}
            className="text-[8px] font-black text-[var(--neo-accent)] hover:underline"
          >
            VIEW ALL
          </Link>
        </div>
        <div className="flex-1 min-h-0 space-y-1.5 overflow-hidden">
          {trendingMods.slice(0, 5).map((mod) => (
            <Link
              key={mod.id}
              href={`${game.nav.mods}/${mod.id}`}
              className="flex items-center gap-1.5 border-2 border-black bg-white/30 p-1.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5 group"
            >
              <span className="relative size-7 shrink-0 overflow-hidden border-2 border-black bg-black">
                <Image src={mod.coverImage} alt={mod.title} fill sizes="28px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-black text-black group-hover:text-[var(--neo-accent)] transition">
                  {mod.title}
                </p>
                <p className="text-[8px] font-bold text-black">{mod.character}</p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-black text-green-400">
                <ArrowUpRight className="size-2.5" />
                {compact(mod.views)}
              </span>
            </Link>
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={`ph-mod-${i}`} className={phClass}><span className="text-[10px] font-black text-black/20">---</span></div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Link
        href={game.nav.ranking ?? `${game.nav.home}/ranking`}
        className="flex w-full shrink-0 items-center justify-center gap-1.5 border-4 border-black bg-[var(--neo-accent)] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
      >
        <Trophy className="size-3.5" />
        VIEW FULL LEADERBOARD
      </Link>
    </aside>
  );
}
