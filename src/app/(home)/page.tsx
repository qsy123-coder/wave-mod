import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Grid3X3,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";

import { FirstVisitDialog } from "@/components/common/first-visit-dialog";
import { FeaturedCarouselSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { HomeHeaderGlass } from "@/components/features/home/home-header-glass";
import { getDefaultGame } from "@/config/games";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { ZenlessHeroStage } from "@/features/games/zenless-zone-zero/components/zenless-hero-stage";
import { ZenlessLowerHome } from "@/features/games/zenless-zone-zero/components/zenless-lower-home";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import {
  getAvailableCharacters,
  getFeaturedMods,
  getLatestMods,
  getPublicMods,
  getTopCreators,
} from "@/lib/mods";

// ─── Scroll-Snap 容器 ───────────────────────────────────────────

function SnapContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-[100vh] overflow-y-scroll max-md:h-auto max-md:min-h-[100vh] max-md:overflow-y-auto"
      style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
    >
      {children}
    </div>
  );
}

// ─── 区域 1: 现有 Hero ──────────────────────────────────────────

async function HomeFeaturedCarousel() {
  const mods = await getFeaturedMods(6);
  return <HeroCarousel mods={mods} />;
}

// ─── 区域 2: ZZZ 风格内容（鸣潮数据） ────────────────────────────

/** 鸣潮 slide 默认数据（Fallback 时使用） */
const wuwaSlideDefaults = {
  titles: [
    "今汐 · 时序之曦",
    "长离 · 玄戈灭光",
    "漂泊者 · 异界旅装",
    "吟霖 · 雷光千瞬",
    "白芷 · 玉笛飞声",
  ],
  characters: ["今汐", "长离", "漂泊者", "吟霖", "白芷"],
  descriptions: [
    "以鸣潮世界观为核心的角色外观 MOD，突出高清预览与直链下载体验。",
    "展示鸣潮角色的战斗姿态与个性化皮肤，保持本站硬边框高对比风格。",
    "面向角色外观、武器替换和 UI 增强 MOD 的主站精选展示位。",
    "保留原站 neo-brutalism 视觉系统，仅按参考图重排首屏结构。",
    "精选鸣潮 MOD 内容入口，每日更新最新发布和热门作品。",
  ],
};

/** 鸣潮 Hero 文案 */
const wuwaCopy = {
  badge: "鸣潮 MOD 精选",
  headingLine1: "Wuthering Waves",
  headingLine2: "Mod Hub",
  subtitle: "高清预览 · 高速直链 · 每日更新",
  fallbackDesc:
    "以鸣潮角色为中心整理 MOD，突出高清预览与直链下载体验，减少网盘跳转和限速干扰。",
  browseLabel: "浏览 MOD",
  guideLabel: "XXMI 教程",
  updateBadge: "最新更新",
  featuredSuffix: "精选",
  exploreLabel: "立即探索",
};

async function HomeWuwaSection() {
  const rawGame = getDefaultGame(); // wuthering-waves
  const game = { ...rawGame, nav: { ...rawGame.nav, mods: "/mods", guide: "/guide" } };
  const [featuredMods, latestMods, topCreators, characters, allMods] =
    await Promise.all([
      getFeaturedMods(6, game.key),
      getLatestMods(4, game.key),
      getTopCreators(6, game.key),
      getAvailableCharacters(game.key),
      getPublicMods(undefined, { gameKey: game.key }),
    ]);

  // 统计数字（基于真实数据）
  const totalMods = allMods.length;
  const avgRating =
    totalMods > 0
      ? (
          allMods.reduce((s, m) => s + m.ratingAverage, 0) / totalMods
        ).toFixed(1)
      : "0.0";

  const stats = [
    { icon: Download, value: `${totalMods}+`, label: "MOD 可用" },
    { icon: Users, value: `${topCreators.length}+`, label: "创作者" },
    { icon: Star, value: avgRating, label: "用户评分" },
    { icon: Grid3X3, value: `${characters.length}+`, label: "角色分类" },
    { icon: Zap, value: "Daily", label: "每日更新" },
  ];

  // 基于真实角色列表生成分类
  const categories = characters.slice(0, 6).map((name) => {
    const count = allMods.filter((m) => m.character === name).length;
    const avatar = getCharacterImagePath(name);
    return {
      avatar,
      name: `${name}外观`,
      query: name,
      count: `${count}`,
    };
  });

  // 创作者数据（从 API）
  const creators = topCreators.map((c) => ({
    name: c.displayName,
    followers: `${Math.max(1, c.totalDownloads / 1000).toFixed(1)}K`,
  }));

  // 鸣潮 MOD 展示
  const wuwaDisplayMods = characters.slice(0, 4).map((name) => ({
    character: name,
    title: `${name} · 精选外观`,
  }));

  return (
    <div className="flex min-h-full flex-col">
      {/* 大屏轮播：从 className 源头设置 h-[40vh]，底部渐变自然过渡 */}
      <ZenlessHeroStage
        game={game}
        mods={featuredMods}
        slideDefaults={wuwaSlideDefaults}
        copy={wuwaCopy}
        className="!h-[44vh] !min-h-0 !pt-[30px]"
      />
      {/* 内容区：与区域 1 等宽，填满剩余空间（ZenlessLowerHome 自带 px，此处仅约束宽度） */}
      <div className="mx-auto w-full max-w-[1680px]">
        <ZenlessLowerHome
          game={game}
          latestMods={latestMods}
          mods={featuredMods}
          stats={stats}
          categories={categories}
          creators={creators}
          displayMods={wuwaDisplayMods}
        />
      </div>
    </div>
  );
}

function WuwaSectionSkeleton() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-black border-t-[var(--neo-accent)]" />
        <p className="text-sm font-black text-white/60">加载鸣潮精选内容...</p>
      </div>
    </div>
  );
}

// ─── 首页 ────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <FirstVisitDialog />
      <HomeHeaderGlass />
      <SnapContainer>
        {/* 区域 1: 现有 Hero（垂直居中，上下各 15vh 留白） */}
        <section
          className="relative flex h-full w-full items-center pt-[calc(15vh+74px)] pb-[calc(15vh+74px)] max-md:pt-4 max-md:pb-4 max-md:h-auto"
          style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <div className="mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">
            <div className="relative overflow-hidden border-4 border-black bg-[var(--neo-panel)] px-5 py-6 shadow-[12px_12px_0px_0px_#000] sm:px-6 lg:px-8 lg:py-8">
              <div className="neo-grid absolute inset-0 opacity-40" />
              <div className="absolute -left-4 top-6 h-14 w-14 rotate-12 border-4 border-black bg-[var(--neo-secondary)]" />
              <div className="absolute right-8 top-8 hidden h-16 w-16 rounded-full border-4 border-black bg-[var(--neo-muted)] lg:block" />
              <div className="relative grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div className="max-w-xl space-y-4 lg:pr-2">
                  <MotionReveal delay={0.02} rotate={-2}>
                    <Badge className="neo-sticker -rotate-2 bg-[var(--neo-accent)] px-4 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-black hover:bg-[var(--neo-accent)]">
                      <Sparkles className="mr-1 size-3" />
                      单主理人精选发布
                    </Badge>
                  </MotionReveal>
                  <div className="space-y-3">
                    <MotionReveal delay={0.08} rotate={1}>
                      <p className="neo-label text-black/65">
                        高清预览 / 高速直链 / 移动端友好
                      </p>
                    </MotionReveal>
                    <MotionReveal delay={0.12}>
                      <div className="space-y-2">
                        <h1 className="max-w-3xl text-[2.65rem] font-black uppercase leading-[0.92] tracking-tight text-black md:text-5xl xl:text-[3.6rem]">
                          鸣潮角色 MOD
                        </h1>
                        <p className="neo-headline-stroke max-w-3xl text-[1.7rem] font-black uppercase leading-[0.94] tracking-tight md:text-[2.15rem] xl:text-[2.7rem]">
                          PREVIEW FIRST. DOWNLOAD FAST.
                        </p>
                        <div className="inline-block rotate-1 border-4 border-black bg-[var(--neo-muted)] px-3 py-1.5 text-base font-black text-black md:text-lg">
                          全屏沉浸式浏览 · 向下滚动探索更多
                        </div>
                      </div>
                    </MotionReveal>
                    <MotionReveal delay={0.18} rotate={-1}>
                      <p className="max-w-lg rotate-1 border-4 border-black bg-white px-4 py-3 text-sm leading-6 text-black md:text-[15px] md:leading-6">
                        以角色为中心整理 MOD，突出高清预览与直链下载体验，减少网盘跳转和限速干扰。
                      </p>
                    </MotionReveal>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <MotionReveal delay={0.24} rotate={-1}>
                      <Link
                        href="/mods?sort=hot"
                        className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]"
                      >
                        查看热度榜
                        <ArrowRight className="size-4" />
                      </Link>
                    </MotionReveal>
                    <MotionReveal delay={0.28} rotate={1}>
                      <Link
                        href="/guide"
                        className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]"
                      >
                        先看安装教程
                        <ArrowRight className="size-4" />
                      </Link>
                    </MotionReveal>
                  </div>
                </div>
                <Suspense fallback={<FeaturedCarouselSkeleton />}>
                  <HomeFeaturedCarousel />
                </Suspense>
              </div>
            </div>
          </div>
        </section>

        {/* 区域 2: ZZZ 风格内容（内容刚好填满一屏，无内部滚动，移动端降级） */}
        <section
          id="snap-section-2"
          className="h-full w-full overflow-hidden max-md:h-auto"
          style={{ scrollSnapAlign: "start", scrollSnapStop: "always",scrollMarginTop:"6vh" }}
        >
          <Suspense fallback={<WuwaSectionSkeleton />}>
            <HomeWuwaSection />
          </Suspense>
        </section>
      </SnapContainer>
    </>
  );
}
