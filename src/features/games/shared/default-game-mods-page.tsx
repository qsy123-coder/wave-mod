import { Suspense } from "react";

import type { GameConfig } from "@/config/games";
import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar } from "@/components/features/mods/list/mods-toolbar";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { getAvailableCharacters, getPublicModsPage, parseCharacterFilter, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";

const sortOptions: { label: string; value: ModSort }[] = [
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
  { label: "收藏", value: "favorites" },
  { label: "评分", value: "rating" },
];

type DefaultGameModsPageProps = {
  game: GameConfig;
  searchParams?: Promise<{
    character?: string;
    query?: string;
    sort?: string;
    nsfw?: string;
  }>;
};

function buildModsHref(game: GameConfig, sort: ModSort, character?: string, query?: string) {
  const params = new URLSearchParams();
  if (sort !== "latest") params.set("sort", sort);
  if (character) params.set("character", character);
  if (query) params.set("query", query);
  const qs = params.toString();
  return qs ? `${game.nav.mods}?${qs}` : game.nav.mods;
}

async function ModsFeed({ character, game, query, sort }: { character?: string; game: GameConfig; query?: string; sort: ModSort }) {
  const firstPage = await getPublicModsPage(1, 16, { sort, character, query, gameKey: game.key });
  return <ModsInfiniteGrid sort={sort} character={character} gameKey={game.key} query={query} initialMods={firstPage.items} />;
}

async function DefaultGameModsPageContent({ game, searchParams }: DefaultGameModsPageProps) {
  const params = (await searchParams) ?? {};
  const currentSort = parseModSort(params.sort);
  const currentCharacter = parseCharacterFilter(params.character);
  const currentQuery = parseModQuery(params.query);
  const availableCharacters = await getAvailableCharacters(game.key);

  // 构造侧边栏角色列表
  const sidebarCharacters = availableCharacters.map((name) => ({
    label: name,
    href: buildModsHref(game, currentSort, name, currentQuery),
    count: 0,
    isActive: name === currentCharacter,
  }));

  // NSFW 切换链接
  const nsfwBase = buildModsHref(game, currentSort, currentCharacter, currentQuery);
  const nsfwToggleHref = params.nsfw === "1"
    ? nsfwBase
    : `${nsfwBase}${nsfwBase.includes("?") ? "&" : "?"}nsfw=1`;

  // 排序选项链接映射
  const sortHrefs: Record<string, string> = {};
  for (const opt of sortOptions) {
    sortHrefs[opt.value] = buildModsHref(game, opt.value, currentCharacter, currentQuery);
  }

  return (
    <div className="flex gap-6">
      {/* 侧边栏 */}
      <div className="hidden w-[180px] shrink-0 lg:block">
        <div className="sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
          <CharacterSidebar
            allLabel="全部"
            allHref={buildModsHref(game, currentSort, undefined, currentQuery)}
            allCount={0}
            isAllActive={!currentCharacter}
            characters={sidebarCharacters}
          />
        </div>
      </div>

      {/* 主内容区 */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* 工具栏 */}
        <ModsToolbar
          gameModsPath={game.nav.mods}
          initialQuery={currentQuery ?? ""}
          showNsfw={params.nsfw === "1"}
          nsfwToggleHref={nsfwToggleHref}
          sort={currentSort}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
        />

        {/* 卡片网格 */}
        <Suspense fallback={<ModGridSkeleton />}>
          <ModsFeed sort={currentSort} character={currentCharacter} game={game} query={currentQuery} />
        </Suspense>
      </div>
    </div>
  );
}

export function DefaultGameModsPage({ game, searchParams }: DefaultGameModsPageProps) {
  return (
    <div className="py-5 lg:py-6">
      <Suspense fallback={<ModGridSkeleton />}>
        <DefaultGameModsPageContent game={game} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
