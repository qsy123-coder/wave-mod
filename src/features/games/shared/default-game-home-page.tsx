import Link from "next/link";
import { ArrowRight, Clock3, Gamepad2, Sparkles, Trophy } from "lucide-react";

import type { GameConfig } from "@/config/games";
import { ModCard } from "@/components/common/mod-card";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getFeaturedMods, getLatestMods, getTopRatedMods, type SiteMod } from "@/lib/mods";

function GameModStrip({ accent, href, mods, title }: { accent: string; href: string; mods: SiteMod[]; title: string }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="inline-block border-4 border-black px-5 py-3 shadow-[8px_8px_0px_0px_#000]" style={{ background: accent }}>
          <p className="neo-label text-black/60">GAME MODS</p>
          <h2 className="mt-2 text-2xl font-black text-black">{title}</h2>
        </div>
        <Link href={href} className="neo-button-outline inline-flex w-fit items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
          查看更多<ArrowRight className="size-4" />
        </Link>
      </div>

      {mods.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mods.map((mod, index) => (
            <MotionReveal key={mod.id} delay={0.05 + index * 0.03} y={18} rotate={index % 2 === 0 ? -1 : 1}>
              <ModCard mod={mod} href={`/${mod.gameKey}/mods/${mod.id}`} variant="home" className="bg-[var(--neo-panel)]" titleTag="h3" />
            </MotionReveal>
          ))}
        </div>
      ) : (
        <div className="border-4 border-black bg-white p-6 text-black shadow-[8px_8px_0px_0px_#000]">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-black/60">暂无数据</p>
          <p className="mt-2 text-2xl font-black">当前游戏分站还没有公开 MOD。</p>
          <p className="mt-3 text-sm font-bold leading-7 text-black/70">后台上传时选择对应游戏后，这里会自动展示数据。</p>
        </div>
      )}
    </section>
  );
}

export async function DefaultGameHomePage({ game }: { game: GameConfig }) {
  const [featuredMods, latestMods, topRatedMods] = await Promise.all([
    getFeaturedMods(3, game.key),
    getLatestMods(3, game.key),
    getTopRatedMods(3, game.key),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.03} rotate={-1}>
        <section className="relative overflow-hidden border-4 border-black p-6 text-black shadow-[12px_12px_0px_0px_#000] sm:p-8" style={{ background: game.theme.accent }}>
          <div className="neo-grid absolute inset-0 opacity-25" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
            <div className="space-y-4">
              <Badge className="neo-sticker bg-white px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-black hover:bg-white">
                <Gamepad2 className="mr-1 size-3.5" />{game.name} MOD 分站
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-black uppercase leading-none md:text-6xl">{game.name} MOD HUB</h1>
                <p className="max-w-2xl border-4 border-black bg-white px-4 py-3 text-sm font-bold leading-7 shadow-[6px_6px_0px_0px_#000]">
                  {game.description} 当前先复用通用 MOD 功能，后续可按设计稿替换首页、分类页、教程页和排行榜。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={game.nav.mods} className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]">
                  浏览 MOD<ArrowRight className="size-4" />
                </Link>
                <Link href={game.nav.guide} className="neo-button-secondary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]">
                  安装教程<ArrowRight className="size-4" />
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="border-4 border-black bg-white p-4 shadow-[7px_7px_0px_0px_#000]">
                <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]"><Sparkles className="size-4" />功能复用</p>
                <p className="mt-2 text-sm font-bold text-black/70">列表、详情、收藏、评论、下载能力可沿用。</p>
              </div>
              <div className="border-4 border-black bg-[#fff8ef] p-4 shadow-[7px_7px_0px_0px_#000]">
                <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]"><Trophy className="size-4" />设计预留</p>
                <p className="mt-2 text-sm font-bold text-black/70">拿到新设计稿后可按游戏替换页面。</p>
              </div>
            </div>
          </div>
        </section>
      </MotionReveal>

      <GameModStrip accent={game.theme.primary} href={`${game.nav.mods}?sort=hot`} mods={featuredMods} title={`${game.name} 热门推荐`} />
      <GameModStrip accent={game.theme.muted} href={`${game.nav.mods}?sort=rating`} mods={topRatedMods} title={`${game.name} 高评分`} />
      <GameModStrip accent={game.theme.accent} href={game.nav.mods} mods={latestMods} title={`${game.name} 最新发布`} />

      <MotionReveal delay={0.16} rotate={1}>
        <section className="border-4 border-black bg-white p-5 text-black shadow-[8px_8px_0px_0px_#000]">
          <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]"><Clock3 className="size-4" />下一步</p>
          <p className="mt-2 text-sm font-bold leading-7 text-black/70">后续可继续接入该游戏独立首页、分类页、教程页、排行榜和数据统计页设计稿。</p>
        </section>
      </MotionReveal>
    </div>
  );
}
