import { Suspense } from "react";

import type { GameConfig } from "@/config/games";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import {
  getAvailableCharacters,
  getPublicMods,
  getTopCreators,
  getWeeklyHotMods,
} from "@/lib/mods";

import { ZenlessRankingHero } from "../components/zenless-ranking-hero";
import { ZenlessRankingSidebarLeft } from "../components/zenless-ranking-sidebar-left";
import { ZenlessRankingLeaderboard } from "../components/zenless-ranking-leaderboard";
import { ZenlessRankingSidebarRight } from "../components/zenless-ranking-sidebar-right";

type Props = {
  game: GameConfig;
  character?: string;
  period?: string;
};

async function ZenlessRankingContent({ game, character, period }: Props) {
  const [mods, topCreators, trendingMods, characters] = await Promise.all([
    getPublicMods(30, { gameKey: game.key, sort: "hot" }),
    getTopCreators(20, game.key),
    getWeeklyHotMods(5, game.key),
    getAvailableCharacters(game.key),
  ]);

  const filteredMods = character
    ? mods.filter((m) => m.character.toLowerCase() === character.toLowerCase())
    : mods;

  return (
    <div
      className="min-h-screen bg-[#04070d]"
      style={{
        backgroundImage: "url(/bg-zzz/zzz-ranking-bg.png)",
        backgroundSize: "100% auto",
        backgroundPosition: "50% -180px",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <ZenlessRankingHero game={game} />

      <div className="mx-auto max-w-[1680px] px-4 py-4 sm:px-5 lg:px-6">
        {/* Mobile: filter row */}
        <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
          <ZenlessRankingSidebarLeft
            game={game}
            categories={characters}
            activeCategory={character ?? ""}
            period={period ?? "all"}
            compact
          />
        </div>

        <div className="grid grid-cols-12 gap-4 sm:gap-5">
          {/* Left Sidebar — desktop only */}
          <div className="col-span-2 hidden lg:block">
            <ZenlessRankingSidebarLeft
              game={game}
              categories={characters}
              activeCategory={character ?? ""}
              period={period ?? "all"}
            />
          </div>

          {/* Central Leaderboard */}
          <div className="col-span-12 lg:col-span-7">
            <ZenlessRankingLeaderboard
              game={game}
              mods={filteredMods}
              topCreators={topCreators}
              period={(period ?? "all") as "all" | "month" | "week" | "today"}
            />
          </div>

          {/* Right Sidebar */}
          <div className="col-span-12 lg:col-span-3">
            <ZenlessRankingSidebarRight
              game={game}
              topCreators={topCreators}
              trendingMods={trendingMods}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ZenlessRankingPage(props: Props) {
  return (
    <Suspense fallback={<ModGridSkeleton />}>
      <ZenlessRankingContent {...props} />
    </Suspense>
  );
}
