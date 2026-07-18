import Link from "next/link";
import { Suspense } from "react";
import { BarChart3, Download, FileStack, Heart, PencilRuler, Plus, RadioTower, Star } from "lucide-react";

import { getEnabledGames, type GameConfig } from "@/config/games";
import { requireAdminUser } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getAdminMods, type AdminMod } from "@/lib/mods";

const numberFormatter = new Intl.NumberFormat("zh-CN");

function sumBy(mods: AdminMod[], selector: (mod: AdminMod) => number) {
  return mods.reduce((total, mod) => total + selector(mod), 0);
}

function averageRating(mods: AdminMod[]) {
  const ratingCount = sumBy(mods, (mod) => mod.ratingCount);

  if (ratingCount === 0) {
    return 0;
  }

  return mods.reduce((total, mod) => total + mod.ratingAverage * mod.ratingCount, 0) / ratingCount;
}

type GameSummary = {
  downloads: number;
  drafts: number;
  favorites: number;
  game: GameConfig;
  mods: number;
  published: number;
  rating: number;
  views: number;
};

async function getGameSummaries(): Promise<GameSummary[]> {
  const games = getEnabledGames();
  const summaries = await Promise.all(
    games.map(async (game) => {
      const mods = await getAdminMods({ gameKey: game.key });
      const published = mods.filter((mod) => mod.isPublished).length;

      return {
        downloads: sumBy(mods, (mod) => mod.downloads),
        drafts: mods.length - published,
        favorites: sumBy(mods, (mod) => mod.favorites),
        game,
        mods: mods.length,
        published,
        rating: averageRating(mods),
        views: sumBy(mods, (mod) => mod.views),
      } satisfies GameSummary;
    }),
  );

  return summaries.sort((a, b) => b.downloads - a.downloads || b.mods - a.mods);
}

function SummaryMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border-4 border-black bg-white p-3 shadow-[4px_4px_0px_0px_#000]">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-black/55">{icon}{label}</p>
      <p className="mt-2 text-xl font-black leading-none text-black">{value}</p>
    </div>
  );
}

function GameSummaryCard({ index, summary }: { index: number; summary: GameSummary }) {
  const { game } = summary;
  const manageHref = `/admin/mods?game=${game.slug}`;
  const statsHref = game.nav.stats ?? `/admin/games/${game.slug}/stats`;
  const uploadHref = `/admin/upload?game=${game.slug}`;

  return (
    <MotionReveal delay={0.08 + index * 0.04} y={24} rotate={index % 2 === 0 ? -1 : 1}>
      <article className="neo-card neo-card-lift bg-[var(--neo-panel)] p-5 text-black">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge className="neo-sticker -rotate-2 bg-[var(--neo-accent)] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-accent)]">
                NO.{index + 1} / {game.shortName}
              </Badge>
              <h2 className="mt-3 text-3xl font-black leading-none">{game.name} MOD 分站</h2>
              <p className="mt-3 max-w-xl text-sm font-bold leading-7 text-black/70">{game.description}</p>
            </div>
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
              <RadioTower className="size-4" />{summary.published} 发布 / {summary.drafts} 草稿
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric icon={<FileStack className="size-3.5" />} label="MOD" value={numberFormatter.format(summary.mods)} />
            <SummaryMetric icon={<Download className="size-3.5" />} label="下载" value={numberFormatter.format(summary.downloads)} />
            <SummaryMetric icon={<Heart className="size-3.5" />} label="收藏" value={numberFormatter.format(summary.favorites)} />
            <SummaryMetric icon={<Star className="size-3.5" />} label="评分" value={summary.rating.toFixed(1)} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={statsHref} className="neo-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
              <BarChart3 className="size-4" />统计详情
            </Link>
            <Link href={manageHref} className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
              <PencilRuler className="size-4" />管理 MOD
            </Link>
            <Link href={uploadHref} className="neo-button-primary inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
              <Plus className="size-4" />上传内容
            </Link>
          </div>
        </div>
      </article>
    </MotionReveal>
  );
}

async function AdminGamesContent() {
  await requireAdminUser("/admin/games");
  const summaries = await getGameSummaries();
  const totalMods = summaries.reduce((total, summary) => total + summary.mods, 0);
  const totalDownloads = summaries.reduce((total, summary) => total + summary.downloads, 0);
  const totalViews = summaries.reduce((total, summary) => total + summary.views, 0);

  return (
    <>
      <MotionReveal delay={0.06} y={20} rotate={1}>
        <section className="neo-card bg-[var(--neo-secondary)] p-5 text-black">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryMetric icon={<FileStack className="size-3.5" />} label="全站 MOD" value={numberFormatter.format(totalMods)} />
            <SummaryMetric icon={<Download className="size-3.5" />} label="全站下载" value={numberFormatter.format(totalDownloads)} />
            <SummaryMetric icon={<RadioTower className="size-3.5" />} label="全站浏览" value={numberFormatter.format(totalViews)} />
          </div>
        </section>
      </MotionReveal>

      <section className="grid gap-5">
        {summaries.map((summary, index) => (
          <GameSummaryCard key={summary.game.key} index={index} summary={summary} />
        ))}
      </section>
    </>
  );
}

export default function AdminGamesPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>
          <p className="neo-label text-black/60">Admin Games</p>
          <h1 className="mt-2 text-4xl font-black text-black">多游戏运营中心</h1>
        </section>
      </MotionReveal>

      <Suspense fallback={<div className="neo-card-lg h-72 animate-pulse bg-[var(--neo-panel)]" />}>
        <AdminGamesContent />
      </Suspense>
    </div>
  );
}
