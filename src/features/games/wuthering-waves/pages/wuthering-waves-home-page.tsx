import { WuwaCtaBanner, WuwaCreatorsBar } from "@/features/games/wuthering-waves/components/home/wuwa-home-cta";
import { WuwaFeaturedModsRail } from "@/features/games/wuthering-waves/components/home/wuwa-featured-mods-rail";
import { WuwaHeroCarousel } from "@/features/games/wuthering-waves/components/home/wuwa-hero-carousel";
import { WuwaHomeNav } from "@/features/games/wuthering-waves/components/home/wuwa-home-nav";
import { WuwaLatestUpdatesSidebar, WuwaPopularCategoriesSidebar } from "@/features/games/wuthering-waves/components/home/wuwa-home-sidebars";
import { WuwaStatsBar } from "@/features/games/wuthering-waves/components/home/wuwa-stats-bar";
import type { WutheringWavesHomePageProps } from "@/features/games/wuthering-waves/components/home/types";

export function WutheringWavesHomePage({ data }: WutheringWavesHomePageProps) {
  const { featuredMods, latestMods, topRatedMods } = data;
  const allFeatured = Array.from(
    new Map([...featuredMods, ...topRatedMods].map((mod) => [mod.id, mod])).values(),
  ).slice(0, 8);

  return (
    <div className="min-h-screen text-white">
      <WuwaHomeNav />
      <WuwaHeroCarousel mods={featuredMods} />
      <WuwaStatsBar />
      <div className="mx-auto max-w-7xl px-6 py-4 md:px-10 lg:px-16">
        <div className="flex gap-6 lg:gap-8">
          <div className="min-w-0 flex-1 space-y-4">
            <WuwaFeaturedModsRail mods={allFeatured} />
            <WuwaCtaBanner />
          </div>
          <div className="hidden w-72 flex-shrink-0 space-y-3 xl:block">
            <WuwaLatestUpdatesSidebar mods={latestMods} />
            <WuwaPopularCategoriesSidebar />
          </div>
        </div>
      </div>
      <WuwaCreatorsBar />
    </div>
  );
}
