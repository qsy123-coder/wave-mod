"use client";

import { useCallback } from "react";

import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { ModsPageClient } from "@/components/features/mods/list/mods-page-client";
import type { ModSort, ModsPage } from "@/lib/mods";
import { isDefaultModsFilters, modsListingKey, type ModsFilters } from "@/lib/mods-domain/filter-params";
import { buildModsFilterHref } from "@/lib/navigation-url";
import { recallScrollPosition, rememberScrollPosition } from "@/lib/scroll-memory";

/**
 * 列表页的**呈现层**。筛选条件从 props 进来（服务端给默认值、客户端从 URL 读），
 * 组件本身不关心它从哪来 —— 这样 `/mods` 的预渲染视图与 hydration 之后的视图
 * 用的是同一份代码，不可能出现「HTML 一套、客户端一套」的错位。
 */

const sortOptions: { label: string; value: ModSort }[] = [
  { label: "默认", value: "default" },
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
  { label: "收藏", value: "favorites" },
  { label: "评分", value: "rating" },
];

/** 固定排在最前的三个特殊分组；它们不参与角色列表的重复渲染 */
const SPECIAL_CATEGORIES = ["Skins", "UI", "Other/Misc"];

/** 侧栏滚动位置的记忆键，只此一处使用（见 lib/scroll-memory.ts） */
const SIDEBAR_SCROLL_KEY = "mods-sidebar";

type ModsListingViewProps = {
  /** 当前生效的筛选条件 */
  filters: ModsFilters;
  /** 库里有内容的角色名（服务端算好，两条渲染路径共用） */
  availableCharacters: string[];
  /** 归一化角色名 → 条数 */
  counts: Record<string, number>;
  /** 服务端预渲染好的第一页（默认筛选）。非默认筛选时会被忽略，见下方 seed */
  staticSeed: ModsPage | null;
  openModId?: string;
};

export function ModsListingView({
  filters,
  availableCharacters,
  counts,
  staticSeed,
  openModId,
}: ModsListingViewProps) {
  const { sort, character, query, direct, preview } = filters;

  /**
   * 侧栏的滚动位置要跨分类导航保住 —— 换筛选条件时 Suspense 边界会把整棵列表换掉，
   * 这个 `overflow-y-auto` 容器是新建节点、scrollTop 天然归零（用户看到的就是
   * 「点一下分类，侧栏跳回最上面」）。记忆只活在当前标签页里，刷新后从头开始。
   *
   * 用 useCallback 拿到稳定引用：引用变了 React 会在每次渲染重新挂一遍 ref，
   * 于是每渲染都会把 scrollTop 拽回记忆里的值，跟用户正在拖的滚动打架。
   */
  const attachSidebarScroll = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollTop = recallScrollPosition(SIDEBAR_SCROLL_KEY);
  }, []);

  /**
   * 拼筛选链接：**永远从当前筛选出发**，只改传入的那一维。
   *
   * 每一项都必须把当前两个开关带上 —— 少了它，正开着「含预览图」的用户点一下角色
   * 分类，筛选就被悄悄丢掉了（参数不在 URL 上 = 没开）。
   *
   * 参数拼法统一走 buildModsFilterHref（navigation-url.ts），与工具栏共用一套约定。
   * 以前这里另有一份 buildModsHref、参数顺序还不同，同一个页面会出现两个字符串
   * 不一样的链接。
   */
  const hrefFor = (next: Partial<ModsFilters> = {}) =>
    buildModsFilterHref("/mods", { ...filters, ...next });

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const skinCount = Object.entries(counts)
    .filter(([k]) => k !== "UI" && k !== "Other/Misc")
    .reduce((sum, [, c]) => sum + c, 0);

  const sidebarCharacters = [
    { label: "Skins", count: skinCount },
    { label: "Other/Misc", count: counts["Other/Misc"] ?? 0 },
    { label: "UI", count: counts["UI"] ?? 0 },
  ]
    .map(({ label, count }) => ({
      label,
      count,
      href: hrefFor({ character: label }),
      isActive: label === character,
    }))
    .concat(
      availableCharacters
        .filter((name) => !SPECIAL_CATEGORIES.includes(name))
        .map((name) => ({
          label: name,
          count: counts[name] ?? 0,
          href: hrefFor({ character: name }),
          isActive: name === character,
        })),
    );

  const sortHrefs: Record<string, string> = {};
  for (const opt of sortOptions) {
    sortHrefs[opt.value] = hrefFor({ sort: opt.value });
  }

  /**
   * **只有默认筛选才能用预渲染的种子。** 种子是构建期按默认筛选算出来的，
   * 把它喂给 `/mods?character=千咲` 这样的 URL，页面会先显示全库最新的 16 条 ——
   * 那是明确违反当前筛选的内容。宁可让网格自己再拉一次第一页（有骨架屏兜着）。
   *
   * 这个闸门放在这里而不是调用方：它是「种子能用」的唯一判据，谁传进来都过这一关。
   */
  const seed = isDefaultModsFilters(filters) ? staticSeed : null;

  return (
    <>
      <div className="hidden w-[240px] shrink-0 flex-col lg:flex">
        <div
          ref={attachSidebarScroll}
          onScroll={(event) => rememberScrollPosition(SIDEBAR_SCROLL_KEY, event.currentTarget.scrollTop)}
          className="flex-1 overflow-y-auto pr-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <CharacterSidebar
            allLabel="全部"
            allHref={hrefFor({ character: undefined })}
            allCount={totalCount}
            isAllActive={!character}
            characters={sidebarCharacters}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ModsPageClient
          gameModsPath="/mods"
          listingKey={modsListingKey(filters)}
          initialQuery={query ?? ""}
          sort={sort}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
          initialMods={seed?.items}
          initialTotalCount={seed?.totalCount}
          character={character}
          activeCharacter={character}
          activeDirect={direct}
          activePreview={preview}
          openModId={openModId}
        />
      </div>
    </>
  );
}
