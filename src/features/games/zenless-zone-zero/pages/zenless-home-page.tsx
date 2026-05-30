import type { GameConfig } from "@/config/games";
import { ZenlessHeroStage } from "@/features/games/zenless-zone-zero/components/zenless-hero-stage";
import { ZenlessLowerHome } from "@/features/games/zenless-zone-zero/components/zenless-lower-home";
import { getFeaturedMods, getLatestMods } from "@/lib/mods";

export async function ZenlessHomePage({ game }: { game: GameConfig }) {
  const [featuredMods, latestMods] = await Promise.all([
    getFeaturedMods(5, game.key),
    getLatestMods(4, game.key),
  ]);

  return (
    <div className="-mt-[74px] min-h-screen">
      <ZenlessHeroStage game={game} mods={featuredMods} />
      <ZenlessLowerHome game={game} latestMods={latestMods} mods={featuredMods} />
    </div>
  );
}
