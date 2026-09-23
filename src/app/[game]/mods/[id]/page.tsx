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

/**
 * ⚠️ 这个页面把 per-user 状态**烤进 HTML**：`getCurrentUser()` / `getViewerModState`
 * / `isAdminUser()` 的结果直接决定渲染出来的按钮与评论区。所以它必须保持动态渲染 ——
 * 下面那个 `getCurrentUser()` 的 cookie 读取**绝不能删**，也不能改成客户端取会话，
 * 否则会把一个登录用户的视图（含点赞态、管理员入口）当成公开页面缓存下来发给所有人。
 *
 * 显式写出来是为了让它显眼：主站的 `/mods` 已经静态化（登录态挪到了客户端），
 * 分站这块是**刻意留着**的（见实施计划「不在本次范围」），不要顺手对齐。
 */
export const dynamic = "force-dynamic";

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
