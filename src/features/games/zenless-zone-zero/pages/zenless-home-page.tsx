import type { GameConfig } from "@/config/games";
import { ZenlessGlassNav } from "@/features/games/zenless-zone-zero/components/zenless-glass-nav";
import { ZenlessHeroStage } from "@/features/games/zenless-zone-zero/components/zenless-hero-stage";
import { getFeaturedMods } from "@/lib/mods";
import { getCurrentUser } from "@/lib/supabase/server";

export async function ZenlessHomePage({ game }: { game: GameConfig }) {
  const [featuredMods, user] = await Promise.all([
    getFeaturedMods(5, game.key),
    getCurrentUser(),
  ]);

  return (
    <div className="min-h-screen bg-[var(--neo-dark)]">
      <ZenlessGlassNav game={game} isLoggedIn={Boolean(user)} />
      <ZenlessHeroStage game={game} mods={featuredMods} />
    </div>
  );
}
