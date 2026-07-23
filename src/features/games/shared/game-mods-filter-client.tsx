"use client";

import { useState } from "react";

import type { GameConfig } from "@/config/games";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar, type NsfwMode } from "@/components/features/mods/list/mods-toolbar";
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
  const [nsfwMode, setNsfwMode] = useState<NsfwMode>("blur");
  const [directOnly, setDirectOnly] = useState(false);
  const [nsfwOnly, setNsfwOnly] = useState(false);
  // 默认用服务端的全量计数；客户端筛选激活后由 grid 回调更新
  const [gridCount, setGridCount] = useState<number | null>(null);

  // 仅当客户端筛选激活时使用 grid 的过滤后数量，否则用服务端全量
  const hasClientFilter = nsfwMode !== "blur" || nsfwOnly || directOnly;
  const modCount = hasClientFilter ? (gridCount ?? serverTotalCount) : serverTotalCount;

  return (
    <>
      <ModsToolbar
        gameModsPath={game.nav.mods}
        initialQuery={initialQuery ?? ""}
        sort={initialSort}
        sortOptions={sortOptions}
        sortHrefs={sortHrefs}
        nsfwMode={nsfwMode}
        onNsfwModeChange={setNsfwMode}
        directOnly={directOnly}
        onDirectOnlyChange={setDirectOnly}
        nsfwOnly={nsfwOnly}
        onNsfwOnlyChange={setNsfwOnly}
        activeCharacter={initialCharacter}
        activeQuery={initialQuery}
        modCount={modCount}
      />

      <ModsInfiniteGrid
        isLoggedIn={isLoggedIn}
        onCountChange={setGridCount}
        sort={initialSort}
        character={initialCharacter}
        gameKey={game.key}
        query={initialQuery}
        initialMods={initialMods}
        nsfwMode={nsfwMode}
        directOnly={directOnly}
        nsfwOnly={nsfwOnly}
      />
    </>
  );
}
