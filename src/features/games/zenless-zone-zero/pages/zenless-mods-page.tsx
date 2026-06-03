import type { GameConfig } from "@/config/games";
import {
  getPublicModsPage,
  parseCharacterFilter,
  parseModQuery,
  parseModSort,
} from "@/lib/mods";
import { ZenlessModsBackground, ZenlessModsHeroCopy } from "../components/zenless-mods-hero";
import { ZenlessModsFilterPanel } from "../components/zenless-mods-filter-panel";
import { ZenlessModsRail } from "../components/zenless-mods-rail";
import { ZenlessModsFooterCta } from "../components/zenless-mods-footer-cta";
import { ZenlessModsToolbar } from "../components/zenless-mods-toolbar";
import { ZenlessModsGrid, ZenlessModsPagination } from "../components/zenless-mods-grid";
import { ZenlessModsMotionItem, ZenlessModsMotionRoot } from "../components/zenless-mods-motion";

type Props = {
  game: GameConfig;
  searchParams?: Promise<{ character?: string; query?: string; sort?: string }>;
};

export async function ZenlessModsPage({ game, searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const sort = params.sort ? parseModSort(params.sort) : "hot";
  const character = parseCharacterFilter(params.character);
  const query = parseModQuery(params.query);
  const { items } = await getPublicModsPage(1, 12, {
    character,
    gameKey: game.key,
    query,
    sort,
  });

  return (
    <main className="relative -mt-[74px] mx-auto min-h-screen w-full max-w-[1680px] overflow-hidden px-4 pb-4 pt-0 sm:px-5 lg:px-6">
      <ZenlessModsBackground />
      <ZenlessModsMotionRoot className="relative z-10 pr-0 xl:pr-[268px]">
        <ZenlessModsMotionItem delay={0.02} lift={12} rotate={-0.4}>
          <ZenlessModsHeroCopy />
        </ZenlessModsMotionItem>
        <ZenlessModsMotionItem className="absolute right-0 top-[74px] hidden w-[250px] xl:block" delay={0.16} lift={14} rotate={0.6}>
          <ZenlessModsRail game={game} mods={items} />
        </ZenlessModsMotionItem>
        <div className="grid gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
          <ZenlessModsMotionItem delay={0.22} lift={18} rotate={-0.8}>
            <ZenlessModsFilterPanel character={character} game={game} query={query} sort={sort} />
          </ZenlessModsMotionItem>
          <section className="space-y-2">
            <ZenlessModsMotionItem delay={0.28} lift={14} rotate={0.4}>
              <ZenlessModsToolbar character={character} game={game} query={query} sort={sort} />
            </ZenlessModsMotionItem>
            <ZenlessModsMotionItem delay={0.34} lift={20} rotate={0.2}>
              <ZenlessModsGrid game={game} mods={items} />
            </ZenlessModsMotionItem>
            <ZenlessModsMotionItem delay={0.42} lift={12} rotate={-0.2}>
              <ZenlessModsPagination />
            </ZenlessModsMotionItem>
          </section>
        </div>
      </ZenlessModsMotionRoot>
      <ZenlessModsMotionItem delay={0.52} lift={14} rotate={0.5}>
        <ZenlessModsFooterCta />
      </ZenlessModsMotionItem>
    </main>
  );
}
