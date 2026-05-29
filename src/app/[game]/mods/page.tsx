import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { DefaultGameModsPage } from "@/features/games/shared/default-game-mods-page";

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

  return <DefaultGameModsPage game={game} searchParams={searchParams} />;
}

export default function GameModsPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <GameModsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
