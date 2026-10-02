"use client";

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
  /** URL 上的「含直链」/「含预览图」开关（服务端过滤） */
  activeDirect?: boolean;
  activePreview?: boolean;
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
  activeDirect = false,
  activePreview = false,
  sortOptions,
  sortHrefs,
  isLoggedIn = false,
}: Props) {
  const { mode: layoutMode, setMode: setLayoutMode, masonryColumns, setMasonryColumns } = useLayoutPreference();

  // 筛选（含两个开关）全在服务端做，服务端给的总数就是准的
  return (
    <>
      <ModsToolbar
        gameModsPath={game.nav.mods}
        initialQuery={initialQuery ?? ""}
        sort={initialSort}
        sortOptions={sortOptions}
        sortHrefs={sortHrefs}
        activeDirect={activeDirect}
        activePreview={activePreview}
        activeCharacter={initialCharacter}
        activeQuery={initialQuery}
        // 必须传：不传的话 /api/mods 会当成默认游戏（鸣潮），联想框里会冒出别的游戏的 MOD
        gameKey={game.key}
        // 刻意不传 onSelectMod：分站没有详情抽屉（点卡片本来就是整页跳转），
        // 联想项会退化成同样的整页跳转，两边行为一致
        modCount={serverTotalCount}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        masonryColumns={masonryColumns}
        onMasonryColumnsChange={setMasonryColumns}
      />

      <ModsInfiniteGrid
        isLoggedIn={isLoggedIn}
        sort={initialSort}
        character={initialCharacter}
        gameKey={game.key}
        query={initialQuery}
        initialMods={initialMods}
        direct={activeDirect}
        preview={activePreview}
        layoutMode={layoutMode}
        masonryColumns={masonryColumns}
      />
    </>
  );
}
