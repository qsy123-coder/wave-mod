import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { DefaultGameHomePage } from "@/features/games/shared/default-game-home-page";
import { ZenlessHomePage } from "@/features/games/zenless-zone-zero/pages/zenless-home-page";

type PageProps = {
  params: Promise<{ game: string }>;
};

async function GameHomeContent({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  if (game.key === "zenless-zone-zero") {
    return <ZenlessHomePage game={game} />;
  }

  return <DefaultGameHomePage game={game} />;
}

export default function GameHomePage({ params }: PageProps) {
  return (
    <Suspense fallback={null}>
      <GameHomeContent params={params} />
    </Suspense>
  );
}
