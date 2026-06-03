import { Suspense } from "react";

import type { GameConfig } from "@/config/games";
import { ZenlessHeroStage } from "@/features/games/zenless-zone-zero/components/zenless-hero-stage";
import { ZenlessHomePageSkeleton } from "@/features/games/zenless-zone-zero/components/zenless-home-skeletons";
import { ZenlessLowerHome } from "@/features/games/zenless-zone-zero/components/zenless-lower-home";
import { getFeaturedMods, getLatestMods } from "@/lib/mods";

async function ZenlessHomeContent({ game }: { game: GameConfig }) {
  const [featuredMods, latestMods] = await Promise.all([
    getFeaturedMods(6, game.key),
    getLatestMods(4, game.key),
  ]);

  return (
    <div className="-mt-[74px] min-h-screen">
      <ZenlessHeroStage game={game} mods={featuredMods} />
      <ZenlessLowerHome game={game} latestMods={latestMods} mods={featuredMods} />
    </div>
  );
}

export function ZenlessHomePage({ game }: { game: GameConfig }) {
  return (
    <Suspense fallback={<ZenlessHomePageSkeleton />}>
      <ZenlessHomeContent game={game} />
    </Suspense>
  );
}
