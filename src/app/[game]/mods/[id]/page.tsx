import { Suspense } from "react";
import { notFound } from "next/navigation";

import { GameModDetailContent } from "@/components/features/mods/detail/game-mod-detail-content";
import { ModDetailSkeleton } from "@/components/layout/data-skeletons";
import { getGameBySlug } from "@/config/games";
import { ZenlessModDetailPage } from "@/features/games/zenless-zone-zero/pages/zenless-mod-detail-page";
import { getLayoutStyle, isZzzStyle } from "@/lib/layout-style/server";
import { getFeaturedMods, getModComments, getPublicModBaseById, getViewerModState } from "@/lib/mods";
import { getCurrentUser, isAdminUser } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ game: string; id: string }>;
};

async function GameSpecificModDetailContent({ params }: PageProps) {
  const resolvedParams = await params;
  const layoutStyle = await getLayoutStyle();

  if (!isZzzStyle(resolvedParams.game, layoutStyle)) {
    return <GameModDetailContent params={Promise.resolve(resolvedParams)} redirectDefaultGame={false} />;
  }

  const game = getGameBySlug(resolvedParams.game);
  if (!game) notFound();

  const [baseMod, viewerState, user, comments, admin, hotMods] = await Promise.all([
    getPublicModBaseById(resolvedParams.id, game.key),
    getViewerModState(resolvedParams.id),
    getCurrentUser(),
    getModComments(resolvedParams.id),
    isAdminUser(),
    getFeaturedMods(12, game.key),
  ]);

  if (!baseMod) notFound();

  const mod = { ...baseMod, ...viewerState };
  const recommendedMods = hotMods.filter((item) => item.id !== mod.id).slice(0, 4);

  return <ZenlessModDetailPage admin={Boolean(admin)} comments={comments} game={game} mod={mod} recommendedMods={recommendedMods} user={user} />;
}

export default function GameModDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ModDetailSkeleton />}>
      <GameSpecificModDetailContent params={params} />
    </Suspense>
  );
}
