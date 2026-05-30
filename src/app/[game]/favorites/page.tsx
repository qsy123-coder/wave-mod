import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, LogOut, Sparkles } from "lucide-react";

import { requireAuthUser, signOutUser } from "@/actions/auth/auth-actions";
import { FavoriteButton } from "@/components/features/mods/detail/favorite-button";
import { ModCard } from "@/components/common/mod-card";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Card, CardContent } from "@/components/ui/card";
import { getGameBySlug } from "@/config/games";
import { getFavoriteMods } from "@/lib/mods";

function FavoritesSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="neo-card-lg h-[420px] animate-pulse bg-[var(--neo-panel)] p-4" />
      ))}
    </div>
  );
}

type PageProps = {
  params: Promise<{ game: string }>;
};

async function GameFavoritesContent({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  const nextPath = `${game.nav.home}/favorites`;
  await requireAuthUser(nextPath);
  const favorites = (await getFavoriteMods()).filter((mod) => mod.gameKey === game.key);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <form action={async () => { "use server"; await signOutUser(game.nav.home); }}>
          <button type="submit" className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
            <LogOut className="size-4" />退出登录
          </button>
        </form>
        <Link href={`${game.nav.mods}?sort=hot`} className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]">
          继续挑选 {game.shortName} MOD<ArrowRight className="size-4" />
        </Link>
      </div>

      {favorites.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <MotionReveal delay={0.1} y={24} rotate={-1}>
            <Card className="neo-card-lg p-6" style={{ background: "var(--neo-panel)" }}>
              <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-5 p-0 text-center text-black">
                <div className="flex size-20 items-center justify-center border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000]"><Sparkles className="size-10" /></div>
                <div className="space-y-2">
                  <p className="text-2xl font-black">你的 {game.name} 收藏夹还是空的</p>
                  <p className="max-w-xl text-sm font-bold leading-7 text-black/75">去 {game.name} MOD 详情页点击“收藏 MOD”后，这里会只展示该分站保存的内容。</p>
                </div>
                <Link href={`${game.nav.mods}?sort=hot`} className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]">先去挑 {game.shortName} MOD<ArrowRight className="size-4" /></Link>
              </CardContent>
            </Card>
          </MotionReveal>

          <MotionReveal delay={0.14} y={24} rotate={1}>
            <Card className="neo-card-lg p-6" style={{ background: game.theme.accent }}>
              <CardContent className="space-y-3 p-0 text-black">
                <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]"><Sparkles className="size-4" />{game.shortName} 收藏夹</p>
                <ul className="space-y-3 text-sm font-bold leading-7 text-black/80"><li>• 只展示 {game.name} 分站收藏</li><li>• 后续可按角色聚合</li><li>• 已失效 MOD 提醒预留</li></ul>
              </CardContent>
            </Card>
          </MotionReveal>
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {favorites.map((mod, index) => (
            <MotionReveal key={mod.id} delay={0.1 + index * 0.04} y={24} rotate={index % 2 === 0 ? -1 : 1}>
              <ModCard
                mod={mod}
                href={`${game.nav.mods}/${mod.id}`}
                linkMode="split"
                className="bg-[var(--neo-panel)] text-black"
                metaBadgeTone="site"
                bodyBottom={(
                  <div className="flex items-center justify-between pt-1 text-sm font-bold text-black/70">
                    <span>收藏于 {new Date(mod.favoritedAt).toLocaleDateString("zh-CN")}</span>
                    <span className="font-black uppercase tracking-[0.12em] text-black">{game.shortName} 收藏夹</span>
                  </div>
                )}
                actions={(
                  <FavoriteButton id={mod.id} isFavorited isLoggedIn nextPath={nextPath} variant="destructive" favoriteLabel="收藏 MOD" unfavoriteLabel="移出收藏" pendingLabel="移除中" onSuccessMessage={{ favorite: "已加入收藏。", unfavorite: "已从收藏夹移除。" }} onSuccessDescription={{ favorite: "现在可以在收藏页快速找到它。", unfavorite: "这条 MOD 已从你的收藏页消失。" }} />
                )}
              />
            </MotionReveal>
          ))}
        </section>
      )}
    </>
  );
}

export default async function GameFavoritesPage({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: game.theme.muted }}>
          <p className="neo-label text-black/60">{game.name} 我的收藏</p>
          <h1 className="mt-2 text-4xl font-black text-black">登录后查看你保存的 {game.shortName} MOD</h1>
        </section>
      </MotionReveal>

      <Suspense fallback={<FavoritesSkeleton />}>
        <GameFavoritesContent params={params} />
      </Suspense>
    </div>
  );
}
