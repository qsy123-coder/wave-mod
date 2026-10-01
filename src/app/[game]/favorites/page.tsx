import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowRight, LogOut } from "lucide-react";

import { signOutUser } from "@/actions/auth/auth-actions";
import { FavoritesClient } from "@/components/features/mods/favorites/favorites-client";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { getGameBySlug } from "@/config/games";
import { getFavoriteMods, type SiteMod } from "@/lib/mods";

type PageProps = {
  params: Promise<{ game: string }>;
};

/**
 * 分站「我的收藏」。
 *
 * 与站点级 /favorites 同一套逻辑，区别只是按 gameKey 过滤。
 * 同样不再要求登录：游客看本机收藏，登录用户看「服务端 ∪ 本机」。
 */
export default async function GameFavoritesPage({ params }: PageProps) {
  await connection();

  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  let serverMods: SiteMod[] = [];
  let signedIn = false;

  try {
    const favorites = await getFavoriteMods();
    signedIn = favorites !== null;
    serverMods = (favorites ?? []).filter((mod) => mod.gameKey === game.key);
  } catch {
    // 按游客视角继续
  }

  return (
    <div className="flex flex-col gap-8 py-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section
          className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]"
          style={{ background: game.theme.muted }}
        >
          <p className="neo-label text-black/60">{game.name} 我的收藏</p>
          <h1 className="mt-2 text-4xl font-black text-black">你收藏的 {game.shortName} MOD</h1>
          <p className="mt-2 text-sm font-bold text-black/70">收藏保存在这台设备上，不需要登录。</p>
        </section>
      </MotionReveal>

      <div className="flex flex-wrap items-center gap-3">
        {signedIn ? (
          <form
            action={async () => {
              "use server";
              await signOutUser(game.nav.home);
            }}
          >
            <button
              type="submit"
              className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
            >
              <LogOut className="size-4" />
              退出登录
            </button>
          </form>
        ) : null}
        <Link
          href={`${game.nav.mods}?sort=hot`}
          className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]"
        >
          继续挑选 {game.shortName} MOD
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <FavoritesClient serverMods={serverMods} signedIn={signedIn} gameKey={game.key} />
    </div>
  );
}
