import Image from "next/image";
import Link from "next/link";
import { Crown, Download, Flame, Heart, Star, Tags, Trophy } from "lucide-react";

import type { GameConfig } from "@/config/games";
import { ModCard } from "@/components/common/mod-card";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import {
  calculateHotScore,
  getPublicMods,
  getTopCreators,
  type SiteMod,
  type TopCreator,
} from "@/lib/mods";
import { CreatorRankingClient } from "@/features/games/shared/creator-ranking-client";

function getDetailHref(game: GameConfig, mod: SiteMod) {
  return `${game.nav.mods}/${mod.id}`;
}

function rankByDownloads(mods: SiteMod[]) {
  return mods.slice().sort((a, b) => b.downloads - a.downloads || b.views - a.views || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function rankByFavorites(mods: SiteMod[]) {
  return mods.slice().sort((a, b) => b.favorites - a.favorites || b.likes - a.likes || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function rankByRating(mods: SiteMod[]) {
  return mods.slice().sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || b.downloads - a.downloads);
}

function rankByHot(mods: SiteMod[]) {
  return mods.slice().sort((a, b) => calculateHotScore(b) - calculateHotScore(a) || b.downloads - a.downloads || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function buildCharacterStats(mods: SiteMod[]) {
  const statMap = new Map<string, { downloads: number; mods: number; views: number }>();

  for (const mod of mods) {
    const current = statMap.get(mod.character) ?? { downloads: 0, mods: 0, views: 0 };
    statMap.set(mod.character, {
      downloads: current.downloads + mod.downloads,
      mods: current.mods + 1,
      views: current.views + mod.views,
    });
  }

  return Array.from(statMap.entries())
    .map(([character, stats]) => ({ character, ...stats }))
    .sort((a, b) => b.downloads - a.downloads || b.mods - a.mods || b.views - a.views)
    .slice(0, 12);
}

function buildTagStats(mods: SiteMod[]) {
  const statMap = new Map<string, { downloads: number; mods: number; views: number }>();

  for (const mod of mods) {
    for (const tag of mod.tags) {
      const current = statMap.get(tag) ?? { downloads: 0, mods: 0, views: 0 };
      statMap.set(tag, {
        downloads: current.downloads + mod.downloads,
        mods: current.mods + 1,
        views: current.views + mod.views,
      });
    }
  }

  return Array.from(statMap.entries())
    .map(([tag, stats]) => ({ tag, ...stats }))
    .sort((a, b) => b.downloads - a.downloads || b.mods - a.mods || b.views - a.views)
    .slice(0, 16);
}

function RankingPodium({ game, mods }: { game: GameConfig; mods: SiteMod[] }) {
  if (mods.length === 0) {
    return (
      <MotionReveal delay={0.08} y={20} rotate={1}>
        <section className="neo-card-lg bg-[var(--neo-panel)] p-8 text-black">
          <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">Ranking Empty</p>
            <h2 className="mt-2 text-3xl font-black">{game.name} 暂无可排行 MOD。</h2>
            <p className="mt-4 text-sm font-bold leading-7 text-black/75">发布更多公开 MOD 后，这里会自动生成下载、收藏、评分和热度榜单。</p>
          </div>
        </section>
      </MotionReveal>
    );
  }

  return (
    <section className="grid gap-5 lg:grid-cols-3">
      {mods.slice(0, 3).map((mod, index) => (
        <MotionReveal key={mod.id} delay={0.1 + index * 0.04} y={26} rotate={index === 1 ? 1 : -1}>
          <ModCard
            mod={mod}
            href={getDetailHref(game, mod)}
            variant="home"
            className="bg-[var(--neo-panel)]"
            metaBadgeTone="site"
            titleTag="h3"
            mediaTopLeft={(
              <Badge className="neo-sticker -rotate-2 bg-[var(--neo-accent)] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-accent)]">
                <Crown className="mr-1 size-3.5" />NO.{index + 1}
              </Badge>
            )}
            showMetaBadges={false}
          />
        </MotionReveal>
      ))}
    </section>
  );
}

/** 创作者排行榜 — 支持按下载量 / 按 MOD 数切换维度 */
function CreatorRanking({
  creators,
  game,
}: {
  creators: TopCreator[];
  game: GameConfig;
}) {
  if (creators.length === 0) {
    return (
      <MotionReveal delay={0.1} y={20} rotate={-1}>
        <section className="neo-card-lg bg-[var(--neo-panel)] p-6 text-black">
          <div className="border-4 border-black bg-white px-5 py-4 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">Creator Ranking</p>
            <h2 className="mt-2 text-2xl font-black">
              {game.name} 暂无创作者排名。
            </h2>
            <p className="mt-2 text-sm font-bold leading-7 text-black/75">
              发布更多 MOD 后，创作者排名将自动生成。
            </p>
          </div>
        </section>
      </MotionReveal>
    );
  }

  return (
    <MotionReveal delay={0.1} y={20} rotate={-1}>
      <CreatorRankingClient creators={creators} game={game} />
    </MotionReveal>
  );
}

function RankingList({ game, icon, mods, title, valueLabel, valueOf }: { game: GameConfig; icon: React.ReactNode; mods: SiteMod[]; title: string; valueLabel: string; valueOf: (mod: SiteMod) => string }) {
  return (
    <MotionReveal delay={0.14} y={22} rotate={1}>
      <section className="neo-card bg-[var(--neo-panel)] p-4 text-black">
        <div className="mb-4 inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
          {icon}{title}
        </div>
        <div className="grid gap-3">
          {mods.slice(0, 8).map((mod, index) => (
            <Link key={mod.id} href={getDetailHref(game, mod)} className="grid gap-3 border-4 border-black bg-white p-3 text-black shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <span className="inline-flex size-9 items-center justify-center border-4 border-black bg-[var(--neo-accent)] text-sm font-black">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-base font-black">{mod.title}</span>
                <span className="mt-1 block text-xs font-bold text-black/60">{mod.character} / v{mod.version}</span>
              </span>
              <span className="text-sm font-black uppercase tracking-[0.12em]">{valueLabel} {valueOf(mod)}</span>
            </Link>
          ))}
        </div>
      </section>
    </MotionReveal>
  );
}

function StatsCloud({ game, characters, tags }: { game: GameConfig; characters: ReturnType<typeof buildCharacterStats>; tags: ReturnType<typeof buildTagStats> }) {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <MotionReveal delay={0.18} y={22} rotate={-1}>
        <div className="neo-card bg-[var(--neo-secondary)] p-5 text-black">
          <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
            <Trophy className="size-4" />角色下载排行
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {characters.map((item, index) => (
              <Link key={item.character} href={`${game.nav.mods}?character=${encodeURIComponent(item.character)}&sort=hot`} className="border-4 border-black bg-white px-3 py-2 text-xs font-black text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5">
                NO.{index + 1} {item.character} · {item.downloads} 下载
              </Link>
            ))}
          </div>
        </div>
      </MotionReveal>

      <MotionReveal delay={0.2} y={22} rotate={1}>
        <div className="neo-card bg-[var(--neo-muted)] p-5 text-black">
          <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
            <Tags className="size-4" />标签热度
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((item, index) => (
              <span key={item.tag} className="border-4 border-black bg-white px-3 py-2 text-xs font-black text-black shadow-[4px_4px_0px_0px_#000]">
                #{item.tag} · {item.mods} MOD · NO.{index + 1}
              </span>
            ))}
          </div>
        </div>
      </MotionReveal>
    </section>
  );
}

export async function DefaultGameRankingPage({ game }: { game: GameConfig }) {
  const [mods, topCreators] = await Promise.all([
    getPublicMods(undefined, { gameKey: game.key, sort: "hot" }),
    getTopCreators(20, game.key),
  ]);
  const hotMods = rankByHot(mods);
  const downloadMods = rankByDownloads(mods);
  const favoriteMods = rankByFavorites(mods);
  const ratingMods = rankByRating(mods);
  const characterStats = buildCharacterStats(mods);
  const tagStats = buildTagStats(mods);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="relative overflow-hidden border-4 border-black bg-[var(--neo-panel)] p-6 text-black shadow-[10px_10px_0px_0px_#000]">
          <div className="neo-grid absolute inset-0 opacity-25" />
          <div className="relative">
            <p className="neo-label text-black/60">{game.name} Ranking</p>
            <h1 className="mt-2 text-4xl font-black uppercase leading-none md:text-5xl">{game.name} 排行榜</h1>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-black/75">按创作者影响力、MOD 下载、收藏、评分和互动热度生成运营榜单，发现最受欢迎的内容和创作者。</p>
          </div>
        </section>
      </MotionReveal>

      {/* 创作者排行榜 */}
      <CreatorRanking creators={topCreators} game={game} />

      <RankingPodium game={game} mods={hotMods} />

      <section className="grid gap-5 xl:grid-cols-3">
        <RankingList game={game} icon={<Download className="size-4" />} mods={downloadMods} title="下载榜" valueLabel="下载" valueOf={(mod) => String(mod.downloads)} />
        <RankingList game={game} icon={<Heart className="size-4" />} mods={favoriteMods} title="收藏榜" valueLabel="收藏" valueOf={(mod) => String(mod.favorites)} />
        <RankingList game={game} icon={<Star className="size-4" />} mods={ratingMods} title="评分榜" valueLabel="评分" valueOf={(mod) => mod.ratingAverage.toFixed(1)} />
      </section>

      <MotionReveal delay={0.16} y={22} rotate={-1}>
        <section className="neo-card bg-[var(--neo-accent)] p-5 text-black">
          <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000]">
            <Flame className="size-4" />综合热度说明
          </div>
          <p className="mt-4 text-sm font-bold leading-7 text-black/75">
            创作者排名基于 MOD 总下载量聚合；综合热度由浏览、下载、收藏、点赞、评论、评分人数和平均评分共同计算，适合作为首页推荐和每周热门的基础信号。
          </p>
        </section>
      </MotionReveal>

      <StatsCloud game={game} characters={characterStats} tags={tagStats} />
    </div>
  );
}
