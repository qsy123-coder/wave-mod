import { MotionReveal } from "@/components/layout/motion-reveal";
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
      <section className="relative z-10 pr-0 xl:pr-[268px]">
        <MotionReveal delay={0.02} y={18} rotate={-1}>
          <ZenlessModsHeroCopy />
        </MotionReveal>
        <MotionReveal className="absolute right-0 top-[74px] hidden w-[250px] xl:block" delay={0.16} y={20} rotate={1}>
          <ZenlessModsRail game={game} mods={items} />
        </MotionReveal>
        <div className="grid gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
          <MotionReveal delay={0.18} y={24} rotate={-1}>
            <ZenlessModsFilterPanel character={character} game={game} query={query} sort={sort} />
          </MotionReveal>
          <section className="space-y-2">
            <MotionReveal delay={0.24} y={18} rotate={1}>
              <ZenlessModsToolbar character={character} game={game} query={query} sort={sort} />
            </MotionReveal>
            <ZenlessModsGrid game={game} mods={items} />
            <MotionReveal delay={0.42} y={18} rotate={-1}>
              <ZenlessModsPagination />
            </MotionReveal>
          </section>
        </div>
      </section>
      <MotionReveal delay={0.5} y={22} rotate={1}>
        <ZenlessModsFooterCta />
      </MotionReveal>
    </main>
  );
}
