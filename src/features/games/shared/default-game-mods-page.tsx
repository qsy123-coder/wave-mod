import { Suspense } from "react";

import type { GameConfig } from "@/config/games";
import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModsToolbar } from "@/components/features/mods/list/mods-toolbar";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { getAvailableCharacters, getPublicMods, getPublicModsPage, parseCharacterFilter, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";

async function getCharacterCounts(gameKey: string): Promise<Record<string, number>> {
  const allMods = await getPublicMods(undefined, { gameKey });
  const counts: Record<string, number> = {};
  for (const mod of allMods) {
    const c = (mod.character ?? "").trim();
    if (c) counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}
import { GameModsFilterClient } from "./game-mods-filter-client";

const sortOptions: { label: string; value: ModSort }[] = [
  { label: "默认", value: "default" },
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
  }>;
};

function buildModsHref(game: GameConfig, sort: ModSort, character?: string, query?: string) {
  const params = new URLSearchParams();
  if (sort !== "default") params.set("sort", sort);
  if (character) params.set("character", character);
  if (query) params.set("query", query);
  const qs = params.toString();
  return qs ? `${game.nav.mods}?${qs}` : game.nav.mods;
}

async function DefaultGameModsPageContent({ game, searchParams }: DefaultGameModsPageProps) {
  const params = (await searchParams) ?? {};
  const currentSort = parseModSort(params.sort);
  const currentCharacter = parseCharacterFilter(params.character);
  const currentQuery = parseModQuery(params.query);
  const serverFilters = { sort: currentSort, character: currentCharacter, query: currentQuery, gameKey: game.key };
  const [availableCharacters, counts, firstPage, allFilteredMods] = await Promise.all([
    getAvailableCharacters(game.key),
    getCharacterCounts(game.key),
    getPublicModsPage(1, 16, serverFilters),
    getPublicMods(undefined, serverFilters),
  ]);

  // 服务端筛选后的总 MOD 数（不含客户端 NSFW/直链筛选）
  const totalModCount = allFilteredMods.length;

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  // 构造侧边栏角色列表
  const sidebarCharacters = availableCharacters.map((name) => ({
    label: name,
    href: buildModsHref(game, currentSort, name, currentQuery),
    count: counts[name] ?? 0,
    isActive: name === currentCharacter,
  }));

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
            allCount={totalCount}
            isAllActive={!currentCharacter}
            characters={sidebarCharacters}
          />
        </div>
      </div>

      {/* 主内容区 — 客户端组件管理过滤状态 */}
      <div className="min-w-0 flex-1 space-y-4">
        <GameModsFilterClient
          game={game}
          initialSort={currentSort}
          initialCharacter={currentCharacter}
          initialQuery={currentQuery}
          initialMods={firstPage.items}
          serverTotalCount={totalModCount}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
        />
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
