import { Suspense } from "react";
import { notFound } from "next/navigation";

import { GameModDetailContent } from "@/components/features/mods/detail/game-mod-detail-content";
import { ModDetailSkeleton } from "@/components/layout/data-skeletons";
import { getGameBySlug } from "@/config/games";
import { ZenlessModDetailPage } from "@/features/games/zenless-zone-zero/pages/zenless-mod-detail-page";
import { getFeaturedMods, getModComments, getPublicModBaseById, getViewerModState } from "@/lib/mods";
import { getCurrentUser, isAdminUser } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ game: string; id: string }>;
};

async function GameSpecificModDetailContent({ params }: PageProps) {
  const resolvedParams = await params;

  if (resolvedParams.game !== "zenless-zone-zero") {
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

  // 注意：全库 5186 条 mod 都属于默认游戏，zenless 分支下 getPublicModBaseById 必然
  // 返回 null 而走 notFound()，所以这条路径实际不可达 —— 这里只做类型适配，
  // 不额外把 degraded 传给 ZenlessCommentsSection。
  return <ZenlessModDetailPage admin={Boolean(admin)} comments={comments.items} game={game} mod={mod} recommendedMods={recommendedMods} user={user} />;
}

export default function GameModDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ModDetailSkeleton />}>
      <GameSpecificModDetailContent params={params} />
    </Suspense>
  );
}
