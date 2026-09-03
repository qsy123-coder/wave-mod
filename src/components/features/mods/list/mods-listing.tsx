import { Suspense } from "react";

import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModsPageClient } from "@/components/features/mods/list/mods-page-client";
import { BodyScrollLock } from "@/components/layout/body-scroll-lock";
import { ModsPageSkeleton } from "@/components/layout/data-skeletons";
import { getCharacterSuggestions, getPublicMods, getPublicModsPage, normalizeCharacterName, parseCharacterFilter, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";
import { getCurrentUser, isAdminUser } from "@/lib/supabase/server";

type PageProps = {
  searchParams?: Promise<{
    sort?: string;
    character?: string;
    query?: string;
  }>;
  openModId?: string;
};

const sortOptions: { label: string; value: ModSort }[] = [
  { label: "默认", value: "default" },
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

async function getCharacterCounts(): Promise<Record<string, number>> {
  try {
    // 使用 getPublicMods 获取全部 mod（已内置分页，不受 Supabase 1,000 行限制）
    const allMods = await getPublicMods();
    const counts: Record<string, number> = {};
    for (const mod of allMods) {
      const c = normalizeCharacterName(mod.character ?? "");
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

async function ModsListingContent({ searchParams, openModId }: PageProps) {
  const params = (await searchParams) ?? {};
  const currentSort = parseModSort(params.sort);
  const currentCharacter = parseCharacterFilter(params.character);
  const currentQuery = parseModQuery(params.query);

  const [availableCharacters, counts, user, admin] = await Promise.all([
    getCharacterSuggestions(),
    getCharacterCounts(),
    getCurrentUser(),
    isAdminUser(),
  ]);

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const skinCount = Object.entries(counts)
    .filter(([k]) => !["UI", "Other/Misc"].includes(k))
    .reduce((sum, [, c]) => sum + c, 0);

  const specialCategories = [
    { label: "Skins", count: skinCount },
    { label: "Other/Misc", count: counts["Other/Misc"] ?? 0 },
    { label: "UI", count: counts["UI"] ?? 0 },
  ];

  const sidebarCharacters = [
    ...specialCategories.map((c) => ({
      label: c.label,
      href: buildModsHref(currentSort, c.label, currentQuery),
      count: c.count,
      isActive: c.label === currentCharacter,
    })),
    ...availableCharacters
      .filter((name) => !["Skins", "UI", "Other/Misc"].includes(name))
      .map((name) => ({
        label: name,
        href: buildModsHref(currentSort, name, currentQuery),
        count: counts[name] ?? 0,
        isActive: name === currentCharacter,
      })),
  ];

  const sortHrefs: Record<string, string> = {};
  for (const opt of sortOptions) {
    sortHrefs[opt.value] = buildModsHref(opt.value, currentCharacter, currentQuery);
  }

  const serverFilters = { sort: currentSort, character: currentCharacter, query: currentQuery };
  const [firstPage, allFilteredMods] = await Promise.all([
    getPublicModsPage(1, 16, serverFilters),
    getPublicMods(undefined, serverFilters),
  ]);
  const initialMods = firstPage.items;
  const serverTotalCount = allFilteredMods.length;

  return (
    <>
      <div className="hidden w-[240px] shrink-0 flex-col lg:flex">
        <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <CharacterSidebar
            allLabel="全部"
            allHref={buildModsHref(currentSort, undefined, currentQuery)}
            allCount={totalCount}
            isAllActive={!currentCharacter}
            characters={sidebarCharacters}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ModsPageClient
          gameModsPath="/mods"
          initialQuery={currentQuery ?? ""}
          sort={currentSort}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
          initialMods={initialMods}
          serverTotalCount={serverTotalCount}
          character={currentCharacter}
          activeCharacter={currentCharacter}
          openModId={openModId}
          admin={Boolean(admin)}
          currentUserId={user?.id}
          currentUserName={
            user?.user_metadata?.display_name ??
            user?.email?.split("@")[0] ??
            "我"
          }
          isLoggedIn={Boolean(user)}
        />
      </div>
    </>
  );
}

export function ModsListing({ searchParams, openModId }: PageProps) {
  return (
    <>
      {/* 骨架屏阶段也锁定 body 滚动，避免加载时仍可滑动 */}
      <BodyScrollLock />
      <Suspense fallback={<ModsPageSkeleton />}>
        <ModsListingContent searchParams={searchParams} openModId={openModId} />
      </Suspense>
    </>
  );
}
