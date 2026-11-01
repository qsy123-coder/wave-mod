import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { FavoritesClient } from "@/components/features/mods/favorites/favorites-client";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { getGameBySlug } from "@/config/games";

type PageProps = {
  params: Promise<{ game: string }>;
};

/**
 * 分站「我的收藏」。
 *
 * 登录已下线：只展示本机设备号下的收藏，并按 gameKey 过滤。
 */
export default async function GameFavoritesPage({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8 py-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section
          className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]"
          style={{ background: game.theme.muted }}
        >
          <p className="neo-label text-black/60">{game.name} · 我的收藏</p>
          <h1 className="mt-2 text-4xl font-black text-black">你收藏的外观资源</h1>
          <p className="mt-2 text-sm font-bold text-black/70">收藏保存在这台设备上，不需要登录。</p>
        </section>
      </MotionReveal>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`${game.nav.mods}?sort=hot`}
          className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]"
        >
          继续挑选外观资源
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <FavoritesClient serverMods={[]} signedIn={false} gameKey={game.key} />
    </div>
  );
}
