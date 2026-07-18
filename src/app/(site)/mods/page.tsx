import { Suspense } from "react";

import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar } from "@/components/features/mods/list/mods-toolbar";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { getAvailableCharacters, getPublicModsPage, parseCharacterFilter, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";

type PageProps = {
  searchParams?: Promise<{
    sort?: string;
    character?: string;
    query?: string;
    nsfw?: string;
  }>;
};

const sortOptions: { label: string; value: ModSort }[] = [
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
  { label: "收藏", value: "favorites" },
  { label: "评分", value: "rating" },
];

function buildModsHref(sort: ModSort, character?: string, query?: string) {
  const params = new URLSearchParams();
  if (sort !== "latest") params.set("sort", sort);
  if (character) params.set("character", character);
  if (query) params.set("query", query);
  const qs = params.toString();
  return qs ? `/mods?${qs}` : "/mods";
}

async function ModsFeed({ sort, character, query }: { sort: ModSort; character?: string; query?: string }) {
  const firstPage = await getPublicModsPage(1, 16, { sort, character, query });
  return <ModsInfiniteGrid sort={sort} character={character} query={query} initialMods={firstPage.items} />;
}

async function ModsPageContent({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const currentSort = parseModSort(params.sort);
  const currentCharacter = parseCharacterFilter(params.character);
  const currentQuery = parseModQuery(params.query);
  const availableCharacters = await getAvailableCharacters();

  const sidebarCharacters = availableCharacters.map((name) => ({
    label: name,
    href: buildModsHref(currentSort, name, currentQuery),
    count: 0,
    isActive: name === currentCharacter,
  }));

  const nsfwBase = buildModsHref(currentSort, currentCharacter, currentQuery);
  const nsfwToggleHref = params.nsfw === "1"
    ? nsfwBase
    : `${nsfwBase}${nsfwBase.includes("?") ? "&" : "?"}nsfw=1`;

  const sortHrefs: Record<string, string> = {};
  for (const opt of sortOptions) {
    sortHrefs[opt.value] = buildModsHref(opt.value, currentCharacter, currentQuery);
  }

  return (
    <div className="flex gap-6">
      {/* 侧边栏 */}
      <div className="hidden w-[180px] shrink-0 lg:block">
        <div className="sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
          <CharacterSidebar
            allLabel="全部"
            allHref={buildModsHref(currentSort, undefined, currentQuery)}
            allCount={0}
            isAllActive={!currentCharacter}
            characters={sidebarCharacters}
          />
        </div>
      </div>

      {/* 主内容区 */}
      <div className="min-w-0 flex-1 space-y-4">
        <ModsToolbar
          gameModsPath="/mods"
          initialQuery={currentQuery ?? ""}
          showNsfw={params.nsfw === "1"}
          nsfwToggleHref={nsfwToggleHref}
          sort={currentSort}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
        />

        <Suspense fallback={<ModGridSkeleton />}>
          <ModsFeed sort={currentSort} character={currentCharacter} query={currentQuery} />
        </Suspense>
      </div>
    </div>
  );
}

export default function ModsPage({ searchParams }: PageProps) {
  return (
    <div className="py-5 lg:py-6">
      <Suspense fallback={<ModGridSkeleton />}>
        <ModsPageContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
