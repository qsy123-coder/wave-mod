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
  sortOptions: { label: string; value: ModSort }[];
  sortHrefs: Record<string, string>;
};

export function GameModsFilterClient({
  game,
  initialSort,
  initialCharacter,
  initialQuery,
  initialMods,
  sortOptions,
  sortHrefs,
}: Props) {
  const [nsfwMode, setNsfwMode] = useState<NsfwMode>("blur");
  const [directOnly, setDirectOnly] = useState(false);
  const [nsfwOnly, setNsfwOnly] = useState(false);

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
      />

      <ModsInfiniteGrid
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
