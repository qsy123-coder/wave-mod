import { Suspense } from "react";

import type { GameConfig } from "@/config/games";
import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { getAvailableCharacters, getPublicMods, getPublicModsPage, normalizeCharacterName, parseCharacterFilter, parseModFlag, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";

async function getCharacterCounts(gameKey: string): Promise<Record<string, number>> {
  const allMods = await getPublicMods(undefined, { gameKey });
  const counts: Record<string, number> = {};
  for (const mod of allMods) {
    const c = normalizeCharacterName(mod.character ?? "");
    if (c) counts[c] = (counts[c] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`[getCharacterCounts] gameKey=${gameKey} characters=${Object.keys(counts).length} total=${total} allMods.length=${allMods.length}`);
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
    /** "1" = 只看有直链下载的 / 只看有真预览图的 */
    direct?: string;
    preview?: string;
  }>;
};

/**
 * 侧边栏 / 排序用的链接。**每一项都要把当前两个开关带上** —— 少了它，正在开着
 * 「含预览图」的用户点一下角色分类，筛选就被悄悄丢掉了（参数不在 URL 上 = 没开）。
 */
function buildModsHref(
  game: GameConfig,
  sort: ModSort,
  character?: string,
  query?: string,
  flags: { direct?: boolean; preview?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (sort !== "latest") params.set("sort", sort);
  if (character) params.set("character", character);
  if (query) params.set("query", query);
  if (flags.direct) params.set("direct", "1");
  if (flags.preview) params.set("preview", "1");
  const qs = params.toString();
  return qs ? `${game.nav.mods}?${qs}` : game.nav.mods;
}

async function DefaultGameModsPageContent({ game, searchParams }: DefaultGameModsPageProps) {
  const params = (await searchParams) ?? {};
  const currentSort = parseModSort(params.sort);
  const currentCharacter = parseCharacterFilter(params.character);
  const currentQuery = parseModQuery(params.query);
  const currentDirect = parseModFlag(params.direct);
  const currentPreview = parseModFlag(params.preview);
  const currentFlags = { direct: currentDirect, preview: currentPreview };
  const serverFilters = {
    sort: currentSort,
    character: currentCharacter,
    query: currentQuery,
    direct: currentDirect,
    preview: currentPreview,
    gameKey: game.key,
  };
  console.log(`[DefaultGameModsPage] character="${currentCharacter}" query="${currentQuery}" sort="${currentSort}" gameKey="${game.key}"`);
  const [availableCharacters, counts, firstPage, allFilteredMods] = await Promise.all([
    getAvailableCharacters(game.key),
    getCharacterCounts(game.key),
    getPublicModsPage(1, 16, serverFilters),
    getPublicMods(undefined, serverFilters),
  ]);

  // 服务端筛选后的总 MOD 数（不含客户端直链筛选）
  const totalModCount = allFilteredMods.length;
  console.log(`[DefaultGameModsPage] availableCharacters=${availableCharacters.length} totalModCount=${totalModCount} firstPage=${firstPage.items.length}`);

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  // 构造侧边栏角色列表
  const sidebarCharacters = availableCharacters.map((name) => ({
    label: name,
    href: buildModsHref(game, currentSort, name, currentQuery, currentFlags),
    count: counts[name] ?? 0,
    isActive: name === currentCharacter,
  }));

  // 排序选项链接映射
  const sortHrefs: Record<string, string> = {};
  for (const opt of sortOptions) {
    sortHrefs[opt.value] = buildModsHref(game, opt.value, currentCharacter, currentQuery, currentFlags);
  }

  return (
    <div className="flex gap-6">
      {/* 侧边栏 */}
      <div className="hidden w-[180px] shrink-0 lg:block">
        <div className="sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
          <CharacterSidebar
            allLabel="全部"
            allHref={buildModsHref(game, currentSort, undefined, currentQuery, currentFlags)}
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
          activeDirect={currentDirect}
          activePreview={currentPreview}
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
