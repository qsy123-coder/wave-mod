"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { ModsToolbar, type NsfwMode } from "@/components/features/mods/list/mods-toolbar";
import { useLayoutPreference } from "@/components/features/mods/list/use-layout-preference";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
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
  const { isLoading, startLoading, stopLoading } = useNavigationLoading();

  // 服务端数据到达时（props 变化）自动结束加载状态
  const prevParamsRef = useRef(`${sort}-${character}-${initialQuery}`);
  useEffect(() => {
    const current = `${sort}-${character}-${initialQuery}`;
    if (prevParamsRef.current !== current) {
      prevParamsRef.current = current;
      stopLoading();
    }
  }, [sort, character, initialQuery, stopLoading]);

  const [nsfwMode, setNsfwMode] = useState<NsfwMode>("blur");
  const [directOnly, setDirectOnly] = useState(false);
  const [nsfwOnly, setNsfwOnly] = useState(false);
  const [gridCount, setGridCount] = useState<number | null>(null);
  const { mode: layoutMode, setMode: setLayoutMode, masonryColumns, setMasonryColumns } = useLayoutPreference();
  const hasClientFilter = nsfwMode !== "blur" || nsfwOnly || directOnly;
  const modCount = hasClientFilter ? (gridCount ?? (serverTotalCount ?? initialMods.length)) : (serverTotalCount ?? initialMods.length);
  const [drawerModId, setDrawerModId] = useState<string | null>(initialModId ?? null);

  const openDrawer = useCallback((modId: string) => {
    setDrawerModId(modId);
    window.history.pushState(null, "", `/mods/${modId}`);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerModId(null);
    window.history.pushState(null, "", "/mods");
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
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
        masonryColumns={masonryColumns}
        onMasonryColumnsChange={setMasonryColumns}
        onFilterChange={startLoading}
      />

      <div className="relative flex-1 overflow-y-auto pt-4 scrollbar-minimal">
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
          masonryColumns={masonryColumns}
          onCountChange={setGridCount}
          onCardClick={openDrawer}
        />
        {/* 筛选/排序加载覆盖层——不影响 ModsInfiniteGrid 内部逻辑 */}
        {isLoading && (
          <div className="absolute inset-0 z-10">
            <ModGridSkeleton count={10} />
          </div>
        )}
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
