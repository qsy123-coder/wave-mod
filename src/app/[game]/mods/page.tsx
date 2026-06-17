import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { DefaultGameModsPage } from "@/features/games/shared/default-game-mods-page";
import { ZenlessModsPage } from "@/features/games/zenless-zone-zero/pages/zenless-mods-page";
import { ZenlessModsPageSkeleton } from "@/features/games/zenless-zone-zero/components/zenless-mods-skeletons";
import { getLayoutStyle, isZzzStyle } from "@/lib/layout-style/server";

type PageProps = {
  params: Promise<{ game: string }>;
  searchParams?: Promise<{
    character?: string;
    query?: string;
    sort?: string;
  }>;
};

async function GameModsContent({ params, searchParams }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  const layoutStyle = await getLayoutStyle();

  if (isZzzStyle(game.key, layoutStyle)) {
    return <ZenlessModsPage game={game} searchParams={searchParams} />;
  }

  return <DefaultGameModsPage game={game} searchParams={searchParams} />;
}

export default function GameModsPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<ZenlessModsPageSkeleton />}>
      <GameModsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
