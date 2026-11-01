import { Suspense } from "react";

import { GameModDetailContent } from "@/components/features/mods/detail/game-mod-detail-content";
import { ModDetailSkeleton } from "@/components/layout/data-skeletons";

type PageProps = {
  params: Promise<{ game: string; id: string }>;
};

/**
 * 登录已下线：页面不再把 per-user 状态烤进 HTML，评论区也已移除。
 * 保留 `force-dynamic` 只是维持现状（详情页本来就不走整页缓存），不影响内容。
 */
export const dynamic = "force-dynamic";

export default function GameModDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ModDetailSkeleton />}>
      <GameModDetailContent params={params} redirectDefaultGame={false} />
    </Suspense>
  );
}
