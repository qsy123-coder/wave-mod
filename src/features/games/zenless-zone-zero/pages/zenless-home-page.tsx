import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Clock3, Flame, Sparkles, Star, Trophy } from "lucide-react";

import type { GameConfig } from "@/config/games";
import { CharacterTagCollapse } from "@/components/common/character-tag-collapse";
import { ModCard } from "@/components/common/mod-card";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import { FeaturedCarouselSkeleton, ModGridSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getAvailableCharacters, getFeaturedMods, getLatestMods, getTopRatedMods, getWeeklyHotMods, type SiteMod } from "@/lib/mods";

async function ZenlessFeaturedCarousel({ game }: { game: GameConfig }) {
  const mods = await getFeaturedMods(6, game.key);
  return <HeroCarousel mods={mods} />;
}

function ZenlessRankingSection({ accent, href, icon, mods, subtitle, title }: { accent: string; href: string; icon: React.ReactNode; mods: SiteMod[]; subtitle: string; title: string }) {
  if (mods.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <MotionReveal delay={0.12} rotate={1}>
          <div className="inline-block border-4 border-black px-5 py-3 shadow-[8px_8px_0px_0px_#000]" style={{ background: accent }}>
            <p className="neo-label text-black/65">绝区零榜单</p>
            <h2 className="mt-2 inline-flex items-center gap-2 text-3xl font-black text-black">{icon}{title}</h2>
            <p className="mt-2 text-sm font-bold text-black/70">{subtitle}</p>
          </div>
        </MotionReveal>
        <MotionReveal delay={0.16} rotate={-1}>
          <Link href={href} className="neo-button-outline inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.16em]">
            查看更多<ArrowRight className="size-4" />
          </Link>
        </MotionReveal>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {mods.map((mod, index) => (
          <MotionReveal key={`${title}-${mod.id}`} delay={0.14 + index * 0.04} y={28} rotate={index % 2 === 0 ? -1 : 1}>
            <ModCard
              mod={mod}
              href={`/zenless-zone-zero/mods/${mod.id}`}
              variant="home"
              className="bg-[var(--neo-panel)]"
              metaBadgeTone="site"
              titleTag="h3"
              ratingStickerClassName="right-3 top-3 bottom-auto rotate-2"
              mediaTopLeft={(
                <>
                  <Badge className="neo-sticker -rotate-2 bg-[var(--neo-secondary)] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-secondary)]">
                    {mod.character}
                  </Badge>
                  <Badge className="neo-sticker rotate-2 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black hover:bg-white">
                    NO.{index + 1}
                  </Badge>
                </>
              )}
              showMetaBadges={false}
            />
          </MotionReveal>
        ))}
      </div>
    </section>
  );
}

async function ZenlessWeeklyHotSection({ game }: { game: GameConfig }) {
  const mods = await getWeeklyHotMods(3, game.key);
  return <ZenlessRankingSection title="本周热门" subtitle="近 7 天互动热度最高的作品" icon={<Flame className="size-7" />} mods={mods} href={`${game.nav.mods}?sort=hot`} accent="var(--neo-accent)" />;
}

async function ZenlessTopRatedSection({ game }: { game: GameConfig }) {
  const mods = await getTopRatedMods(3, game.key);
  return <ZenlessRankingSection title="高评分精选" subtitle="评分和评分人数表现更强的作品" icon={<Trophy className="size-7" />} mods={mods} href={`${game.nav.mods}?sort=rating`} accent="var(--neo-muted)" />;
}

async function ZenlessLatestSection({ game }: { game: GameConfig }) {
  const mods = await getLatestMods(3, game.key);
  return <ZenlessRankingSection title="最新发布" subtitle="最近上架的公开 MOD" icon={<Clock3 className="size-7" />} mods={mods} href={game.nav.mods} accent="var(--neo-secondary)" />;
}

async function ZenlessCharacterSection({ game }: { game: GameConfig }) {
  const availableCharacters = await getAvailableCharacters(game.key);
  const characterTags = availableCharacters.map((character, index) => ({
    href: `${game.nav.mods}?character=${encodeURIComponent(character)}&sort=hot`,
    isActive: false,
    label: character,
    className: index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]",
  }));

  return (
    <section className="space-y-4">
      <MotionReveal delay={0.08} rotate={-1}>
        <div className="inline-block border-4 border-black bg-[var(--neo-secondary)] px-5 py-3 shadow-[8px_8px_0px_0px_#000]">
          <p className="neo-label text-black/65">角色分类</p>
          <h2 className="mt-2 text-3xl font-black text-black">代理人、阵营与风格筛选</h2>
        </div>
      </MotionReveal>
      <CharacterTagCollapse
        characterTags={characterTags}
        collapsedCount={6}
        itemClassName="inline-flex border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000] transition duration-100 ease-linear hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
        moreButtonClassName="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[6px_6px_0px_0px_#000] transition duration-100 ease-linear hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
      />
    </section>
  );
}

function ZenlessCharacterSectionSkeleton() {
  return (
    <section className="space-y-4">
      <div className="inline-block border-4 border-black bg-[var(--neo-secondary)] px-5 py-3 shadow-[8px_8px_0px_0px_#000]">
        <p className="neo-label text-black/65">角色分类</p>
        <h2 className="mt-2 text-3xl font-black text-black">代理人、阵营与风格筛选</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-11 w-20 animate-pulse border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]" />)}
      </div>
    </section>
  );
}

export function ZenlessHomePage({ game }: { game: GameConfig }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="relative overflow-hidden border-4 border-black bg-[var(--neo-panel)] px-5 py-6 shadow-[12px_12px_0px_0px_#000] sm:px-6 lg:px-8 lg:py-8">
        <div className="neo-grid absolute inset-0 opacity-40" />
        <div className="absolute -left-4 top-6 h-14 w-14 rotate-12 border-4 border-black bg-[var(--neo-secondary)]" />
        <div className="absolute right-8 top-8 hidden h-16 w-16 rounded-full border-4 border-black bg-[var(--neo-muted)] lg:block" />
        <div className="relative grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-xl space-y-4 lg:pr-2">
            <MotionReveal delay={0.02} rotate={-2}>
              <Badge className="neo-sticker -rotate-2 bg-[var(--neo-accent)] px-4 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-black hover:bg-[var(--neo-accent)]">
                <Sparkles className="mr-1 size-3" />绝区零 MOD 分站
              </Badge>
            </MotionReveal>
            <div className="space-y-3">
              <MotionReveal delay={0.08} rotate={1}>
                <p className="neo-label text-black/65">高速直链 / 代理人筛选 / 霓虹街区风</p>
              </MotionReveal>
              <MotionReveal delay={0.12}>
                <div className="space-y-2">
                  <h1 className="max-w-3xl text-[2.65rem] font-black uppercase leading-[0.92] tracking-tight text-black md:text-5xl xl:text-[3.6rem]">绝区零 MOD</h1>
                  <p className="neo-headline-stroke max-w-3xl text-[1.7rem] font-black uppercase leading-[0.94] tracking-tight md:text-[2.15rem] xl:text-[2.7rem]">NEO CITY. MOD FAST.</p>
                  <div className="inline-block rotate-1 border-4 border-black bg-[var(--neo-muted)] px-3 py-1.5 text-base font-black text-black md:text-lg">当前接管旧 neo 分站视觉</div>
                </div>
              </MotionReveal>
              <MotionReveal delay={0.18} rotate={-1}>
                <p className="max-w-lg rotate-1 border-4 border-black bg-white px-4 py-3 text-sm leading-6 text-black md:text-[15px] md:leading-6">这里保留原鸣潮使用的高对比 neo 风格，用作绝区零分站视觉基础；后续可按绝区零设计稿继续细化。</p>
              </MotionReveal>
            </div>
            <div className="flex flex-wrap gap-3">
              <MotionReveal delay={0.24} rotate={-1}><Link href={`${game.nav.mods}?sort=hot`} className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]">查看热度榜<ArrowRight className="size-4" /></Link></MotionReveal>
              <MotionReveal delay={0.28} rotate={1}><Link href={game.nav.guide} className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]">先看安装教程<ArrowRight className="size-4" /></Link></MotionReveal>
            </div>
          </div>
          <Suspense fallback={<FeaturedCarouselSkeleton />}><ZenlessFeaturedCarousel game={game} /></Suspense>
        </div>
      </section>

      <Suspense fallback={<ZenlessCharacterSectionSkeleton />}><ZenlessCharacterSection game={game} /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><ZenlessWeeklyHotSection game={game} /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><ZenlessTopRatedSection game={game} /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><ZenlessLatestSection game={game} /></Suspense>

      <MotionReveal delay={0.24} rotate={-1}>
        <section className="neo-card-lg p-6 text-black" style={{ background: "var(--neo-accent)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="neo-label text-black/65">视觉归属</p>
              <h2 className="mt-2 text-3xl font-black uppercase">这套 neo 风格现在归属绝区零分站</h2>
            </div>
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
              <Star className="size-4" />鸣潮将切换为 ui_images 新设计稿
            </div>
          </div>
        </section>
      </MotionReveal>
    </div>
  );
}
