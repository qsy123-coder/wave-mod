import type { GameConfig } from "@/config/games";
import { GooeyText } from "@/components/ui/gooey-text-morphing";

const RANKING_TEXTS = [
  "TOP CREATORS",
  "BEST MODS",
  "LEADERBOARD",
  "HALL OF FAME",
  "TRENDING NOW",
  "TOP DOWNLOADS",
  "MOST LIKED",
  "RISING STARS",
];

export function ZenlessRankingHero({ game }: { game: GameConfig }) {
  return (
    <section className="relative -mt-[74px] mb-8 flex items-center pt-[74px] h-[180px] sm:h-[190px] lg:h-[205px] shrink-0">
      <div className="relative z-10 mx-auto w-full max-w-[1680px] px-5 py-3.5 sm:py-4 lg:py-4 lg:px-6">
        <span className="inline-block mb-4 -rotate-1 border-2 border-black bg-[var(--neo-accent)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-black shadow-[2px_2px_0px_0px_#000]">
          Rankings
        </span>
        <GooeyText
          texts={RANKING_TEXTS}
          morphTime={1}
          cooldownTime={0.25}
          className="mt-2.5 sm:mt-3 lg:mt-3.5 h-[1.2em] w-full max-w-3xl"
          textClassName="text-xl sm:text-2xl lg:text-3xl font-black leading-none text-black !left-0"
        />
        <p className="mt-2 sm:mt-2.5 lg:mt-3 max-w-xl text-[10px] sm:text-xs font-bold leading-snug text-black">
          Discover the most popular mods and talented creators in the{" "}
          {game.name} community.
        </p>
      </div>
    </section>
  );
}
