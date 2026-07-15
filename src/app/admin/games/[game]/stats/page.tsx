import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BarChart3, Download, Eye, FileStack, Heart, Star, Tags, Trophy, Users } from "lucide-react";

import { getGameBySlug, getEnabledGames, type GameConfig } from "@/config/games";
import { requireAdminUser } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getAdminMods, type AdminMod } from "@/lib/mods";

const numberFormatter = new Intl.NumberFormat("zh-CN");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function sumBy(mods: AdminMod[], selector: (mod: AdminMod) => number) {
  return mods.reduce((total, mod) => total + selector(mod), 0);
}

function averageRating(mods: AdminMod[]) {
  const ratedMods = mods.filter((mod) => mod.ratingCount > 0);

  if (ratedMods.length === 0) {
    return 0;
  }

  const weightedTotal = ratedMods.reduce((total, mod) => total + mod.ratingAverage * mod.ratingCount, 0);
  const ratingCount = sumBy(ratedMods, (mod) => mod.ratingCount);

  return ratingCount > 0 ? weightedTotal / ratingCount : 0;
}

function buildCharacterStats(mods: AdminMod[]) {
  const map = new Map<string, { downloads: number; favorites: number; mods: number; views: number }>();

  for (const mod of mods) {
    const current = map.get(mod.character) ?? { downloads: 0, favorites: 0, mods: 0, views: 0 };
    map.set(mod.character, {
      downloads: current.downloads + mod.downloads,
      favorites: current.favorites + mod.favorites,
      mods: current.mods + 1,
      views: current.views + mod.views,
    });
  }

  return Array.from(map.entries())
    .map(([character, stats]) => ({ character, ...stats }))
    .sort((a, b) => b.downloads - a.downloads || b.favorites - a.favorites || b.mods - a.mods)
    .slice(0, 10);
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border-4 border-black bg-white p-4 text-black shadow-[6px_6px_0px_0px_#000]">
      <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-black/60">
        {icon}{label}
      </div>
      <p className="mt-3 text-3xl font-black leading-none">{value}</p>
    </div>
  );
}

function GameSwitcher({ currentGame }: { currentGame: GameConfig }) {
  const games = getEnabledGames();

  return (
    <MotionReveal delay={0.08} y={18} rotate={1}>
      <section className="neo-card bg-[var(--neo-panel)] p-4 text-black">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <BarChart3 className="size-4" />统计游戏
          </span>
          {games.map((game) => (
            <Link key={game.key} href={game.nav.stats ?? `/admin/games/${game.slug}/stats`} className={`border-4 border-black px-4 py-2 text-sm font-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 ${game.key === currentGame.key ? "bg-[var(--neo-secondary)]" : "bg-white"}`}>
              {game.name}
            </Link>
          ))}
        </div>
      </section>
    </MotionReveal>
  );
}

function TopModsTable({ game, mods }: { game: GameConfig; mods: AdminMod[] }) {
  const topMods = mods
    .slice()
    .sort((a, b) => b.downloads - a.downloads || b.favorites - a.favorites || b.views - a.views)
    .slice(0, 8);

  return (
    <MotionReveal delay={0.16} y={22} rotate={-1}>
      <section className="neo-card bg-[var(--neo-panel)] p-4 text-black">
        <div className="mb-4 inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
          <Trophy className="size-4" />下载 TOP MOD
        </div>
        <div className="grid gap-3">
          {topMods.map((mod, index) => (
            <Link key={mod.id} href={`/admin/mods/${mod.id}/edit`} className="grid gap-3 border-4 border-black bg-white p-3 text-black shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">
              <span className="inline-flex size-9 items-center justify-center border-4 border-black bg-[var(--neo-accent)] text-sm font-black">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-base font-black">{mod.title}</span>
                <span className="mt-1 block text-xs font-bold text-black/60">{mod.character} / {game.name} / {mod.isPublished ? "已发布" : "草稿"}</span>
              </span>
              <span className="text-sm font-black">下载 {formatNumber(mod.downloads)}</span>
              <span className="text-sm font-black">收藏 {formatNumber(mod.favorites)}</span>
            </Link>
          ))}
        </div>
      </section>
    </MotionReveal>
  );
}

async function AdminGameStatsContent({ game }: { game: GameConfig }) {
  await requireAdminUser(`/admin/games/${game.slug}/stats`);
  const mods = await getAdminMods(game.key);
  const publishedCount = mods.filter((mod) => mod.isPublished).length;
  const draftCount = mods.length - publishedCount;
  const characterStats = buildCharacterStats(mods);

  return (
    <>
      <GameSwitcher currentGame={game} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<FileStack className="size-4" />} label="MOD 总数" value={formatNumber(mods.length)} />
        <StatCard icon={<Download className="size-4" />} label="下载总量" value={formatNumber(sumBy(mods, (mod) => mod.downloads))} />
        <StatCard icon={<Heart className="size-4" />} label="收藏总量" value={formatNumber(sumBy(mods, (mod) => mod.favorites))} />
        <StatCard icon={<Star className="size-4" />} label="加权评分" value={averageRating(mods).toFixed(1)} />
        <StatCard icon={<Eye className="size-4" />} label="浏览总量" value={formatNumber(sumBy(mods, (mod) => mod.views))} />
        <StatCard icon={<Users className="size-4" />} label="角色数量" value={formatNumber(characterStats.length)} />
        <StatCard icon={<BarChart3 className="size-4" />} label="发布 / 草稿" value={`${publishedCount} / ${draftCount}`} />
      </section>

      <TopModsTable game={game} mods={mods} />

      <section className="grid gap-5 lg:grid-cols-2">
        <MotionReveal delay={0.18} y={22} rotate={1}>
          <div className="neo-card bg-[var(--neo-secondary)] p-5 text-black">
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
              <Users className="size-4" />角色分布
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {characterStats.map((item, index) => (
                <Badge key={item.character} className="neo-sticker bg-white px-3 py-2 text-xs font-black text-black hover:bg-white">
                  NO.{index + 1} {item.character} · {item.mods} MOD · {formatNumber(item.downloads)} 下载
                </Badge>
              ))}
            </div>
          </div>
        </MotionReveal>

      </section>
    </>
  );
}

type PageProps = {
  params: Promise<{ game: string }>;
};

async function AdminGameStatsRouteContent({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  return (
    <>
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>
          <p className="neo-label text-black/60">Admin Game Stats</p>
          <h1 className="mt-2 text-4xl font-black text-black">{game.name} 运营统计</h1>
        </section>
      </MotionReveal>

      <AdminGameStatsContent game={game} />
    </>
  );
}

export default function AdminGameStatsPage({ params }: PageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Suspense fallback={<div className="neo-card-lg h-72 animate-pulse bg-[var(--neo-panel)]" />}>
        <AdminGameStatsRouteContent params={params} />
      </Suspense>
    </div>
  );
}
