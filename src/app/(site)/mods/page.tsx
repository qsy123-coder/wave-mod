import { Suspense } from "react";
import { Filter, X } from "lucide-react";

import { CharacterTagCollapse } from "@/components/common/character-tag-collapse";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { SiteSearchForm } from "@/components/layout/site-search-form";
import { getAvailableCharacters, getPublicModsPage, parseCharacterFilter, parseModQuery, parseModSort, type ModSort } from "@/lib/mods";

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

  if (sort !== "latest") {
    params.set("sort", sort);
  }

  if (character) {
    params.set("character", character);
  }

  if (query) {
    params.set("query", query);
  }

  const queryString = params.toString();
  return queryString ? `/mods?${queryString}` : "/mods";
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
  const characterTags = availableCharacters.map((character, index) => ({
    href: buildModsHref(currentSort, character, currentQuery),
    isActive: character === currentCharacter,
    label: character,
    className: character === currentCharacter ? "bg-[#ff7a7a]" : index % 3 === 0 ? "bg-[#ff7a7a]" : index % 3 === 1 ? "bg-[#ffd84f]" : "bg-[#bcaeff]",
  }));

  return (
    <>
      <MotionReveal delay={0.03} rotate={-1}>
        <section className="border-4 border-black bg-[#fff8ef] p-4 shadow-[8px_8px_0px_0px_#000]">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="neo-label text-black/60">MOD 分类页</p>
                <h1 className="text-2xl font-black text-black sm:text-3xl">搜索、筛选并快速浏览更多 MOD</h1>
              </div>

              {currentCharacter || currentQuery ? (
                <div className="flex flex-wrap gap-2">
                  {currentCharacter ? (
                    <div className="inline-flex items-center gap-2 border-4 border-black bg-[#ffd84f] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
                      当前角色：{currentCharacter}
                    </div>
                  ) : null}
                  {currentQuery ? (
                    <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-2 text-xs font-black shadow-[4px_4px_0px_0px_#000]">
                      关键词：{currentQuery}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="w-full xl:justify-self-end">
              <Suspense fallback={<div className="neo-card min-w-0 w-full px-3 py-2.5 text-sm font-bold text-black/60" style={{ background: "var(--neo-search)" }}>加载搜索…</div>}>
                <SiteSearchForm />
              </Suspense>
            </div>
          </div>

          <div className="mt-4 space-y-3 border-t-4 border-black pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="inline-flex h-fit items-center gap-2 border-4 border-black bg-[#bcaeff] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
                <Filter className="size-4" />排序
              </div>
              <div className="flex flex-wrap gap-2">
                {sortOptions.map((option) => {
                  const active = option.value === currentSort;

                  return (
                    <a
                      key={option.value}
                      href={buildModsHref(option.value, currentCharacter, currentQuery)}
                      className={`border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000] ${active ? "bg-[#ff7a7a] text-black" : "bg-white text-black/75"}`}
                    >
                      {option.label}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="inline-flex h-fit items-center gap-2 border-4 border-black bg-[#ff7a7a] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
                <X className="size-4" />角色
              </div>
              <CharacterTagCollapse
                allLabel="全部角色"
                allTagHref={buildModsHref(currentSort, undefined, currentQuery)}
                allTagClassName={`inline-flex items-center gap-2 border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000] ${!currentCharacter ? "bg-[#ff7a7a] text-black" : "bg-white text-black/75"}`}
                characterTags={characterTags}
                collapsedCount={6}
                itemClassName="border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000]"
                moreButtonClassName="border-4 border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000]"
              />
            </div>
          </div>
        </section>
      </MotionReveal>

      <Suspense fallback={<ModGridSkeleton />}>
        <ModsFeed sort={currentSort} character={currentCharacter} query={currentQuery} />
      </Suspense>
    </>
  );
}

export default function ModsPage({ searchParams }: PageProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <Suspense fallback={<ModGridSkeleton />}>
        <ModsPageContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
