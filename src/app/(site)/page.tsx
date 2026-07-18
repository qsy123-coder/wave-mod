import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Clock3, Crown, Flame, Sparkles, Star, Trophy } from "lucide-react";

import { CharacterTagCollapse } from "@/components/common/character-tag-collapse";
import { ModCard } from "@/components/common/mod-card";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import { FeaturedCarouselSkeleton, ModGridSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { defaultGameKey } from "@/config/games";
import {
  getAvailableCharacters,
  getFeaturedMods,
  getLatestMods,
  getTopCreators,
  getTopRatedMods,
  getWeeklyHotMods,
  type SiteMod,
} from "@/lib/mods";

async function HomeFeaturedCarousel() {
  const mods = await getFeaturedMods(6);
  return <HeroCarousel mods={mods} />;
}

function HomeRankingSection({
  title,
  subtitle,
  icon,
  mods,
  href,
  accent,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  mods: SiteMod[];
  href: string;
  accent: string;
}) {
  if (mods.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <MotionReveal delay={0.12} rotate={1}>
          <div className="inline-block border-4 border-black px-5 py-3 shadow-[8px_8px_0px_0px_#000]" style={{ background: accent }}>
            <p className="neo-label text-black/65">首页榜单</p>
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
        {mods.map((mod, index) => {
          const rankLabel = `NO.${index + 1}`;

          return (
            <MotionReveal key={`${title}-${mod.id}`} delay={0.14 + index * 0.04} y={28} rotate={index % 2 === 0 ? -1 : 1}>
              <ModCard
                mod={mod}
                href={`/mods/${mod.id}`}
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
                      {rankLabel}
                    </Badge>
                  </>
                )}
                showMetaBadges={false}
              />
            </MotionReveal>
          );
        })}
      </div>
    </section>
  );
}

async function HomeWeeklyHotSection() {
  const mods = await getWeeklyHotMods(3);
  return <HomeRankingSection title="本周热门" subtitle="近 7 天互动热度最高的作品" icon={<Flame className="size-7" />} mods={mods} href="/mods?sort=hot" accent="var(--neo-accent)" />;
}

async function HomeTopRatedSection() {
  const mods = await getTopRatedMods(3);
  return <HomeRankingSection title="高评分精选" subtitle="评分和评分人数表现更强的作品" icon={<Trophy className="size-7" />} mods={mods} href="/mods?sort=rating" accent="var(--neo-muted)" />;
}

async function HomeLatestSection() {
  const mods = await getLatestMods(3);
  return <HomeRankingSection title="最新发布" subtitle="最近上架的公开 MOD" icon={<Clock3 className="size-7" />} mods={mods} href="/mods" accent="var(--neo-secondary)" />;
}

async function HomeCharacterSection() {
  const availableCharacters = await getAvailableCharacters();
  const characterTags = availableCharacters.map((character, index) => ({
    href: `/mods?character=${encodeURIComponent(character)}&sort=hot`,
    isActive: false,
    label: character,
    className: index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]",
  }));

  return (
    <section className="space-y-4">
      <MotionReveal delay={0.08} rotate={-1}>
        <div className="inline-block border-4 border-black bg-[var(--neo-secondary)] px-5 py-3 shadow-[8px_8px_0px_0px_#000]">
          <p className="neo-label text-black/65">角色分类</p>
          <h2 className="mt-2 text-3xl font-black text-black">先按角色，再按风格筛选</h2>
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

async function HomeTopCreatorsSection() {
  const creators = await getTopCreators(5, defaultGameKey);

  if (creators.length === 0) return null;

  return (
    <section className="space-y-4">
      <MotionReveal delay={0.1} rotate={-1}>
        <div className="inline-block border-4 border-black px-5 py-3 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
          <p className="neo-label text-black/65">优秀创作者</p>
          <h2 className="mt-2 inline-flex items-center gap-2 text-3xl font-black text-black">
            <Crown className="size-7" />按总下载量排名
          </h2>
        </div>
      </MotionReveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {creators.map((creator, index) => (
          <MotionReveal key={creator.userId} delay={0.12 + index * 0.04} y={20} rotate={index % 2 === 0 ? -1 : 1}>
            <Link
              href={`/profile?user=${creator.userId}`}
              className="group flex flex-col items-center gap-3 border-4 border-black bg-white p-5 text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-full border-3 border-black bg-[var(--neo-accent)] text-sm font-black">
                {index + 1}
              </span>
              <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-full border-3 border-black bg-[#f5f5f5]">
                {creator.avatarUrl ? (
                  <Image src={creator.avatarUrl} alt={creator.displayName} fill sizes="56px" className="object-cover" />
                ) : (
                  <span className="text-xl font-black text-black/30">{creator.displayName.charAt(0)}</span>
                )}
              </span>
              <div className="text-center">
                <p className="text-sm font-black group-hover:underline">{creator.displayName}</p>
                <p className="mt-0.5 text-[11px] font-bold text-black/55">
                  {creator.modCount} 个 MOD
                </p>
                <p className="mt-0.5 text-xs font-black">
                  {creator.totalDownloads >= 1000 ? `${(creator.totalDownloads / 1000).toFixed(1)}K` : creator.totalDownloads} 下载
                </p>
              </div>
            </Link>
          </MotionReveal>
        ))}
      </div>
    </section>
  );
}

function HomeCharacterSectionSkeleton() {
  return (
    <section className="space-y-4">
      <div className="inline-block border-4 border-black bg-[var(--neo-secondary)] px-5 py-3 shadow-[8px_8px_0px_0px_#000]">
        <p className="neo-label text-black/65">角色分类</p>
        <h2 className="mt-2 text-3xl font-black text-black">先按角色，再按风格筛选</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-11 w-20 animate-pulse border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]" />)}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10 py-8 lg:py-10">
      <section className="relative overflow-hidden border-4 border-black bg-[var(--neo-panel)] px-5 py-6 shadow-[12px_12px_0px_0px_#000] sm:px-6 lg:px-8 lg:py-8">
        <div className="neo-grid absolute inset-0 opacity-40" />
        <div className="absolute -left-4 top-6 h-14 w-14 rotate-12 border-4 border-black bg-[var(--neo-secondary)]" />
        <div className="absolute right-8 top-8 hidden h-16 w-16 rounded-full border-4 border-black bg-[var(--neo-muted)] lg:block" />
        <div className="relative grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-xl space-y-4 lg:pr-2">
            <MotionReveal delay={0.02} rotate={-2}>
              <Badge className="neo-sticker -rotate-2 bg-[var(--neo-accent)] px-4 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-black hover:bg-[var(--neo-accent)]">
                <Sparkles className="mr-1 size-3" />单主理人精选发布
              </Badge>
            </MotionReveal>
            <div className="space-y-3">
              <MotionReveal delay={0.08} rotate={1}>
                <p className="neo-label text-black/65">高清预览 / 高速直链 / 移动端友好</p>
              </MotionReveal>
              <MotionReveal delay={0.12}>
                <div className="space-y-2">
                  <h1 className="max-w-3xl text-[2.65rem] font-black uppercase leading-[0.92] tracking-tight text-black md:text-5xl xl:text-[3.6rem]">鸣潮角色 MOD</h1>
                  <p className="neo-headline-stroke max-w-3xl text-[1.7rem] font-black uppercase leading-[0.94] tracking-tight md:text-[2.15rem] xl:text-[2.7rem]">PREVIEW FIRST. DOWNLOAD FAST.</p>
                  <div className="inline-block rotate-1 border-4 border-black bg-[var(--neo-muted)] px-3 py-1.5 text-base font-black text-black md:text-lg">热门、高评分、最新三条榜单流</div>
                </div>
              </MotionReveal>
              <MotionReveal delay={0.18} rotate={-1}>
                <p className="max-w-lg rotate-1 border-4 border-black bg-white px-4 py-3 text-sm leading-6 text-black md:text-[15px] md:leading-6">以角色为中心整理 MOD，突出高清预览与直链下载体验，减少网盘跳转和限速干扰。</p>
              </MotionReveal>
            </div>
            <div className="flex flex-wrap gap-3">
              <MotionReveal delay={0.24} rotate={-1}><Link href="/mods?sort=hot" className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]">查看热度榜<ArrowRight className="size-4" /></Link></MotionReveal>
              <MotionReveal delay={0.28} rotate={1}><Link href="/guide" className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]">先看安装教程<ArrowRight className="size-4" /></Link></MotionReveal>
            </div>
          </div>
          <Suspense fallback={<FeaturedCarouselSkeleton />}><HomeFeaturedCarousel /></Suspense>
        </div>
      </section>

      <Suspense fallback={<HomeCharacterSectionSkeleton />}><HomeCharacterSection /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><HomeWeeklyHotSection /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><HomeTopRatedSection /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><HomeLatestSection /></Suspense>
      <Suspense fallback={<ModGridSkeleton />}><HomeTopCreatorsSection /></Suspense>

      <MotionReveal delay={0.24} rotate={-1}>
        <section className="neo-card-lg p-6 text-black" style={{ background: "var(--neo-accent)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="neo-label text-black/65">支持本站</p>
              <h2 className="mt-2 text-3xl font-black uppercase">高清预览 + 直链下载 + 单主理人维护</h2>
            </div>
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
              <Star className="size-4" />首页真实数据已接通，下一步可继续补收藏与评论
            </div>
          </div>
        </section>
      </MotionReveal>
    </div>
  );
}
