import { Suspense } from "react";

import { getGameBySlug } from "@/config/games";
import { ZenlessGlassNav } from "@/features/games/zenless-zone-zero/components/zenless-glass-nav";

type GameLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
};

async function GameLayoutContent({ children, params }: GameLayoutProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (game?.key !== "zenless-zone-zero") {
    return children;
  }

  return (
    <>
      <ZenlessGlassNav game={game} />
      <div className="min-h-screen bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px] pt-[74px]">
        {children}
      </div>
    </>
  );
}

export default function GameLayout({ children, params }: GameLayoutProps) {
  return (
    <Suspense fallback={children}>
      <GameLayoutContent params={params}>{children}</GameLayoutContent>
    </Suspense>
  );
}
