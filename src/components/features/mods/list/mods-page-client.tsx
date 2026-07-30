"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar, type NsfwMode } from "@/components/features/mods/list/mods-toolbar";
import { useLayoutPreference } from "@/components/features/mods/list/use-layout-preference";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import type { ModSort, SiteMod } from "@/lib/mods";

type ModsPageClientProps = {
  gameModsPath: string;
  initialQuery: string;
  sort: string;
  sortOptions: { label: string; value: ModSort }[];
  sortHrefs: Record<string, string>;
  initialMods: SiteMod[];
  serverTotalCount?: number;
  character?: string;
  gameKey?: string;
  activeCharacter?: string;
  openModId?: string;
  // drawer user props
  admin?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  isLoggedIn?: boolean;
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
  openModId: initialModId,
  serverTotalCount,
  admin = false,
  currentUserId,
  currentUserName,
  isLoggedIn = false,
}: ModsPageClientProps) {
  const [nsfwMode, setNsfwMode] = useState<NsfwMode>("blur");
  const [directOnly, setDirectOnly] = useState(false);
  const [nsfwOnly, setNsfwOnly] = useState(false);
  const [gridCount, setGridCount] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useLayoutPreference();
  const hasClientFilter = nsfwMode !== "blur" || nsfwOnly || directOnly;
  const modCount = hasClientFilter ? (gridCount ?? (serverTotalCount ?? initialMods.length)) : (serverTotalCount ?? initialMods.length);
  const [drawerModId, setDrawerModId] = useState<string | null>(initialModId ?? null);

  // 同步浏览器历史：点击卡片时 pushState，浏览器后退/前进时 popstate
  const openDrawer = useCallback((modId: string) => {
    setDrawerModId(modId);
    window.history.pushState(null, "", `/mods/${modId}`);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerModId(null);
    window.history.pushState(null, "", "/mods");
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/mods\/(.+)$/);
      setDrawerModId(match ? match[1] : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
        nsfwOnly={nsfwOnly}
        onNsfwOnlyChange={setNsfwOnly}
        activeCharacter={activeCharacter}
        activeQuery={initialQuery || undefined}
        modCount={modCount}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
      />

      <div className="flex-1 overflow-y-auto pt-4 scrollbar-minimal">
        <Suspense fallback={<ModGridSkeleton count={10} />}>
          <ModsInfiniteGrid
            sort={sort as ModSort}
            character={character}
            gameKey={gameKey}
            query={initialQuery || undefined}
            initialMods={initialMods}
            nsfwMode={nsfwMode}
            directOnly={directOnly}
            nsfwOnly={nsfwOnly}
            isLoggedIn={isLoggedIn}
            layoutMode={layoutMode}
            onCountChange={setGridCount}
            onCardClick={openDrawer}
          />
        </Suspense>
      </div>

      {drawerModId && (
        <ModDetailDrawer
          admin={admin}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isLoggedIn={isLoggedIn}
          modId={drawerModId}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
