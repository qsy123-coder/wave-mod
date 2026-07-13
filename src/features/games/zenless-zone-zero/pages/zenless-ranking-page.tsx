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
    <div className="h-[calc(100vh-74px)] sm:h-[calc(100vh-80px)] lg:h-[calc(100vh-74px)] flex flex-col zzz-ranking-bg overflow-hidden">
      <ZenlessRankingHero game={game} />

      <div className="flex-1 min-h-0 mx-auto w-full max-w-[1680px] px-4 pb-4 sm:px-5 lg:px-6 flex flex-col">
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

        <div className="grid grid-cols-12 gap-4 sm:gap-5 flex-1 min-h-0">
          {/* Left Sidebar — desktop only */}
          <div className="col-span-2 hidden lg:flex lg:flex-col min-h-0">
            <div className="flex flex-col gap-4 flex-1 min-h-0 ">
              <ZenlessRankingSidebarLeft
                game={game}
                categories={characters}
                activeCategory={character ?? ""}
                period={period ?? "all"}
              />
            </div>
          </div>

          {/* Central Leaderboard */}
          <div className="col-span-12 lg:col-span-7 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0">
              <ZenlessRankingLeaderboard
                game={game}
                mods={filteredMods}
                topCreators={topCreators}
                period={(period ?? "all") as "all" | "month" | "week" | "today"}
              />
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="col-span-12 lg:flex lg:flex-col lg:col-span-3 min-h-0">
            <div className="flex flex-col gap-4 flex-1 min-h-0 ">
              <ZenlessRankingSidebarRight
                game={game}
                topCreators={topCreators}
                trendingMods={trendingMods}
              />
            </div>
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
