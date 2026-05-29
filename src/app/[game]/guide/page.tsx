import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { DefaultGameGuidePage } from "@/features/games/shared/default-game-guide-page";

type PageProps = {
  params: Promise<{ game: string }>;
};

async function GameGuideContent({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  return <DefaultGameGuidePage game={game} />;
}

export default function GameGuidePage({ params }: PageProps) {
  return (
    <Suspense fallback={null}>
      <GameGuideContent params={params} />
    </Suspense>
  );
}
