import { Suspense } from "react";

import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModsPageClient } from "@/components/features/mods/list/mods-page-client";
import { ModsPageSkeleton } from "@/components/layout/data-skeletons";
import { getAvailableCharacters, getPublicModsPage, parseCharacterFilter, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";
import { createPublicReadClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams?: Promise<{
    sort?: string;
    character?: string;
    query?: string;
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

/** 获取每个角色的已发布 Mod 数量 */
async function getCharacterCounts(): Promise<Record<string, number>> {
  try {
    const supabase = createPublicReadClient();
    const { data, error } = await supabase
      .from("mods")
      .select("character")
      .eq("is_published", true);

    if (error || !data) return {};

    const counts: Record<string, number> = {};
    for (const row of data) {
      const c = String(row.character ?? "").trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

async function ModsPageContent({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const currentSort = parseModSort(params.sort);
  const currentCharacter = parseCharacterFilter(params.character);
  const currentQuery = parseModQuery(params.query);

  const [availableCharacters, counts] = await Promise.all([
    getAvailableCharacters(),
    getCharacterCounts(),
  ]);

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  // 特殊分类（Skins = 所有角色 MOD 排除 UI/Other/Misc）
  const skinCount = Object.entries(counts)
    .filter(([k]) => !["Skins", "UI", "Other/Misc"].includes(k))
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

  return (
    <div className="flex gap-6">
      {/* 侧边栏 — 固定，内部独立滚动 */}
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

      {/* 主内容区 — 独立滚动 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ModsPageClient
          gameModsPath="/mods"
          initialQuery={currentQuery ?? ""}
          sort={currentSort}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
          initialMods={(await getPublicModsPage(1, 16, { sort: currentSort, character: currentCharacter, query: currentQuery })).items}
          character={currentCharacter}
        />
      </div>
    </div>
  );
}

export default function ModsPage({ searchParams }: PageProps) {
  return (
    <div className="flex h-[calc(100vh-60px)] flex-col overflow-hidden">
      <div className="flex flex-1 gap-6 overflow-hidden py-3">
        <Suspense fallback={<ModsPageSkeleton />}>
          <ModsPageContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
