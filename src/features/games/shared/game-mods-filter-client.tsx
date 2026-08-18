"use client";

import { useState } from "react";

import type { GameConfig } from "@/config/games";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar } from "@/components/features/mods/list/mods-toolbar";
import { useLayoutPreference } from "@/components/features/mods/list/use-layout-preference";
import type { ModSort, SiteMod } from "@/lib/mods";

type Props = {
  game: GameConfig;
  initialSort: ModSort;
  initialCharacter?: string;
  initialQuery?: string;
  initialMods: SiteMod[];
  serverTotalCount: number;
  sortOptions: { label: string; value: ModSort }[];
  sortHrefs: Record<string, string>;
  isLoggedIn?: boolean;
};

export function GameModsFilterClient({
  game,
  initialSort,
  initialCharacter,
  initialQuery,
  initialMods,
  serverTotalCount,
  sortOptions,
  sortHrefs,
  isLoggedIn = false,
}: Props) {
  const [directOnly, setDirectOnly] = useState(false);
  // 默认用服务端的全量计数；客户端筛选激活后由 grid 回调更新
  const [gridCount, setGridCount] = useState<number | null>(null);
  const { mode: layoutMode, setMode: setLayoutMode, masonryColumns, setMasonryColumns } = useLayoutPreference();

  // 仅当客户端筛选激活时使用 grid 的过滤后数量，否则用服务端全量
  const hasClientFilter = directOnly;
  const modCount = hasClientFilter ? (gridCount ?? serverTotalCount) : serverTotalCount;

  return (
    <>
      <ModsToolbar
        gameModsPath={game.nav.mods}
        initialQuery={initialQuery ?? ""}
        sort={initialSort}
        sortOptions={sortOptions}
        sortHrefs={sortHrefs}
        directOnly={directOnly}
        onDirectOnlyChange={setDirectOnly}
        activeCharacter={initialCharacter}
        activeQuery={initialQuery}
        modCount={modCount}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        masonryColumns={masonryColumns}
        onMasonryColumnsChange={setMasonryColumns}
      />

      <ModsInfiniteGrid
        isLoggedIn={isLoggedIn}
        onCountChange={setGridCount}
        sort={initialSort}
        character={initialCharacter}
        gameKey={game.key}
        query={initialQuery}
        initialMods={initialMods}
        directOnly={directOnly}
        layoutMode={layoutMode}
        masonryColumns={masonryColumns}
      />
    </>
  );
}
