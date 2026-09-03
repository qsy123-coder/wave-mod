import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { FirstVisitDialog } from "@/components/common/first-visit-dialog";
import { LazyHomeLower } from "@/components/features/home/lazy-lower-home";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import { FeaturedCarouselSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getFeaturedMods } from "@/lib/mods";

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

// ─── 首页 ────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <FirstVisitDialog />
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

        {/* 区域 2: ZZZ 风格内容（滚动到该屏才加载，首屏不触发，浏览器不再长时间转圈） */}
        <section
          id="snap-section-2"
          className="h-full w-full overflow-hidden max-md:h-auto"
          style={{ scrollSnapAlign: "start", scrollSnapStop: "always",scrollMarginTop:"6vh" }}
        >
          <LazyHomeLower />
        </section>
      </SnapContainer>
    </>
  );
}
