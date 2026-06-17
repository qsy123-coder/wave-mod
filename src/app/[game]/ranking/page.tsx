import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { defaultGameKey, getGameBySlug } from "@/config/games";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";
import { DefaultGameRankingPage } from "@/features/games/shared/default-game-ranking-page";
import { ZenlessRankingPage } from "@/features/games/zenless-zone-zero/pages/zenless-ranking-page";
import { getLayoutStyle, isZzzStyle } from "@/lib/layout-style/server";

type PageProps = {
  params: Promise<{ game: string }>;
};

async function GameRankingContent({ params }: PageProps) {
  const { game: gameSlug } = await params;

  if (gameSlug === defaultGameKey) {
    redirect("/ranking");
  }

  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  const layoutStyle = await getLayoutStyle();

  if (isZzzStyle(game.key, layoutStyle)) {
    return <ZenlessRankingPage game={game} />;
  }

  return <DefaultGameRankingPage game={game} />;
}

export default function GameRankingPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ModGridSkeleton />}>
      <GameRankingContent params={params} />
    </Suspense>
  );
}
