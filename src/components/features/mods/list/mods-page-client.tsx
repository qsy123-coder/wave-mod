"use client";

import { Suspense, useState } from "react";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar, type NsfwMode } from "@/components/features/mods/list/mods-toolbar";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import type { ModSort, SiteMod } from "@/lib/mods";

type ModsPageClientProps = {
  gameModsPath: string;
  initialQuery: string;
  sort: string;
  sortOptions: { label: string; value: ModSort }[];
  sortHrefs: Record<string, string>;
  initialMods: SiteMod[];
  character?: string;
  gameKey?: string;
  activeCharacter?: string;
};

export function ModsPageClient({
  gameModsPath,
  initialQuery,
  sort,
  sortOptions,
  sortHrefs,
  initialMods,
  character,
  gameKey,
  activeCharacter,
}: ModsPageClientProps) {
  const [nsfwMode, setNsfwMode] = useState<NsfwMode>("blur");
  const [directOnly, setDirectOnly] = useState(false);

  return (
    <>
      <ModsToolbar
        gameModsPath={gameModsPath}
        initialQuery={initialQuery}
        sort={sort}
        sortOptions={sortOptions}
        sortHrefs={sortHrefs}
        nsfwMode={nsfwMode}
        onNsfwModeChange={setNsfwMode}
        directOnly={directOnly}
        onDirectOnlyChange={setDirectOnly}
        activeCharacter={activeCharacter}
        activeQuery={initialQuery || undefined}
      />

      <div className="flex-1 overflow-y-auto pt-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <Suspense fallback={<ModGridSkeleton count={10} />}>
          <ModsInfiniteGrid
            sort={sort as ModSort}
            character={character}
            gameKey={gameKey}
            query={initialQuery || undefined}
            initialMods={initialMods}
            nsfwMode={nsfwMode}
            directOnly={directOnly}
          />
        </Suspense>
      </div>
    </>
  );
}
