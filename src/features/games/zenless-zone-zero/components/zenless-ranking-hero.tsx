import type { GameConfig } from "@/config/games";

export function ZenlessRankingHero({ game }: { game: GameConfig }) {
  return (
    <section className="relative -mt-[74px] flex min-h-[200px] items-center overflow-hidden pt-[74px]">

      <div className="relative z-10 mx-auto w-full max-w-[1680px] px-5 py-8 lg:px-6">
        <span className="inline-block -rotate-1 border-2 border-black bg-[var(--neo-accent)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-black shadow-[2px_2px_0px_0px_#000]">
          Rankings
        </span>
        <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-white [text-shadow:2px_2px_0_#000] lg:text-4xl">
          TOP CREATORS & MODS
        </h1>
        <p className="mt-2 max-w-xl text-xs font-bold leading-relaxed text-slate-400">
          Discover the most popular mods and talented creators in the{" "}
          {game.name} community.
        </p>
      </div>
    </section>
  );
}
