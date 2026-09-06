"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bell, ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import type { GameConfig } from "@/config/games";
import { isExternalStorageUrl } from "@/lib/storage/shared";

export type ZenlessHeroSlide = {
  character: string;
  coverImage: string;
  description: string;
  href: string;
  id: string;
  title: string;
  version: string;
};

export type ZenlessHeroCopy = {
  badge?: string;
  headingLine1?: string;
  headingLine2?: string;
  subtitle?: string;
  fallbackDesc?: string;
  browseLabel?: string;
  guideLabel?: string;
  updateBadge?: string;
  featuredSuffix?: string;
  exploreLabel?: string;
};

type ZenlessHeroCarouselClientProps = {
  game: GameConfig;
  slides: ZenlessHeroSlide[];
  copy?: ZenlessHeroCopy;
  className?: string;
  /** 图片容器的顶部溢出，默认 -top-10（向上溢出 40px） */
  imageTopClass?: string;
  /** 图片内容下移量（px），通过 margin-top 推动整个内层容器 */
  imageShiftPx?: number;
  /** object-position，控制 object-cover 的焦点，如 "50% 35%" 展示偏上内容 */
  imagePosition?: string;
  /** 全屏背景模式：图片填满容器 + 渐变在顶部 */
  fullscreen?: boolean;
};

export function ZenlessHeroCarouselClient({ game, slides, copy, className, imageTopClass, imageShiftPx, imagePosition, fullscreen }: ZenlessHeroCarouselClientProps) {
  const c = copy;
  const [current, setCurrent] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [bgVisible, setBgVisible] = useState(false);
  const total = slides.length;
  const activeSlide = slides[current] ?? slides[0];

  const previous = () => setCurrent((value) => (value - 1 + total) % total);
  const next = () => setCurrent((value) => (value + 1) % total);

  useEffect(() => {
    const t = setTimeout(() => setIsLoaded(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Fullscreen 模式：监听 section 2 是否在视口内，控制固定背景图可见性
  useEffect(() => {
    if (!fullscreen) return;
    const section = document.getElementById("snap-section-2");
    if (!section) return;

    // threshold 0 → 0.3：section2 位于第一屏满屏之后、顶部贴住视口底边缘，
    // threshold 0 会在闲置时把"仅露 1px/贴边"误判为进入视口，提前弹出全屏背景图盖住首页卡片。
    // 改为需 section2 真正滚进来约 30% 才显示背景（符合"滚到第二屏才出现"的设计意图）。
    const observer = new IntersectionObserver(
      ([entry]) => setBgVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [fullscreen]);

  useEffect(() => {
    if (total <= 1) return;

    const timer = window.setInterval(() => {
      setCurrent((value) => (value + 1) % total);
    }, 5600);

    return () => window.clearInterval(timer);
  }, [total]);

  return (
    <section data-carousel-section className={`relative h-[55vh] min-h-[470px] bg-transparent pt-[58px] text-white ${className ?? ""}`}>
      {/* Fullscreen 模式：固定全屏背景图（导航栏下方），跟随轮播切换 */}
      {fullscreen && (
        <div
          className={`fixed inset-0 top-[74px] z-0 transition-opacity duration-500 ${bgVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          {activeSlide.coverImage ? (
            <Image
              key={`bg-${activeSlide.id}`}
              src={activeSlide.coverImage}
              alt=""
              fill
              unoptimized={isExternalStorageUrl(activeSlide.coverImage ?? "")}
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_68%_36%,var(--neo-accent)_0,transparent_26%),linear-gradient(135deg,#090909_0%,#1b1b1b_48%,#030303_100%)]" />
          )}
          {/* 顶部渐变：导航栏与图片边界自然过渡 */}
          <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,var(--zzz-hero-bg,#3a2418)_0%,rgba(58,36,24,0.55)_40%,transparent_100%)]" />
        </div>
      )}

      {/* 默认模式：原有图片容器（非 fullscreen 时使用） */}
      {!fullscreen ? (
        <div data-carousel-img className={`absolute inset-x-0 -bottom-20 ${imageTopClass ?? "-top-10"}`}>
          <div
            className="relative h-full"
            style={{
              transform: imageShiftPx ? `translateY(${imageShiftPx}px)` : undefined,
            }}
          >
            {activeSlide.coverImage ? (
              <Image
                key={activeSlide.id}
                src={activeSlide.coverImage}
                alt={activeSlide.title}
                fill
                unoptimized={isExternalStorageUrl(activeSlide.coverImage ?? "")}
                priority
                sizes="100vw"
                className={`object-cover transition-transform duration-700 ease-out scale-100`}
                style={imagePosition ? { objectPosition: imagePosition } : undefined}
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_68%_36%,var(--neo-accent)_0,transparent_26%),linear-gradient(135deg,#090909_0%,#1b1b1b_48%,#030303_100%)]" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(to_bottom,transparent_0%,rgba(var(--zzz-hero-bg-rgb,58,36,24),0.62)_44%,var(--zzz-hero-bg,#3a2418)_82%,var(--zzz-hero-bg,#3a2418)_100%)]" />
            <div className="neo-grid absolute inset-0 opacity-[0.16] mix-blend-screen" />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={previous}
        className="neo-button-outline absolute left-3 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center bg-white/30 p-0 text-black backdrop-blur-[2px] md:inline-flex"
        aria-label="上一张轮播"
      >
        <ChevronLeft className="size-5" />
      </button>

      <button
        type="button"
        onClick={next}
        className="neo-button-outline absolute right-3 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center bg-white/30 p-0 text-black backdrop-blur-[2px] md:inline-flex"
        aria-label="下一张轮播"
      >
        <ChevronRight className="size-5" />
      </button>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% center; }
          100% { background-position: 0% center; }
        }
        .tahoe-glass-text {
            color: transparent;
            background: linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.4) 25%, rgba(255, 255, 255, 0.1) 45%, rgba(255, 255, 255, 0.9) 55%, rgba(255, 255, 255, 0.2) 75%, rgba(255, 255, 255, 1) 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-stroke: 1.5px rgba(255, 255, 255, 0.3);
            filter: drop-shadow(0 15px 35px rgba(0,0,0,0.4)) drop-shadow(0 5px 10px rgba(0,0,0,0.2));
            animation: shimmer 8s linear infinite;
        }
      `}</style>

      <div className="relative z-10 mx-auto grid h-full w-full max-w-[1500px] grid-cols-1 items-center gap-2 px-4 pb-16 pt-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:px-4">
        <div className="max-w-2xl pt-1">
          <MotionReveal delay={0.02} rotate={-2}>
            <div className="mb-2 inline-flex -rotate-1 items-center gap-2 border-4 border-black bg-[var(--neo-accent)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-black shadow-[5px_5px_0px_0px_#000]">
              <Sparkles className="size-3.5" /> {c?.badge ?? "Shape Your New Eridu"}
            </div>
          </MotionReveal>

          <MotionReveal delay={0.08} y={28}>
            <h1 className="tahoe-glass-text max-w-xl text-[2.35rem] font-black uppercase leading-[0.86] tracking-tight sm:text-5xl lg:text-[2.45rem] xl:text-[3.05rem]">
              {c?.headingLine1 ?? "Zenless Zone Zero"}<br />{c?.headingLine2 ?? "Mod Hub"}
            </h1>
          </MotionReveal>

          <MotionReveal delay={0.14} y={20} rotate={1}>
            <div
              className={`transition-all duration-[1200ms] ease-out transform ${
                isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"
              }`}
              style={{ transitionDelay: "250ms" }}
            >
              <p className="mt-2 max-w-md text-sm font-black text-white/90 sm:text-base">{c?.subtitle ?? "Explore. Customize. Download Fast."}</p>
              <p className="mt-1.5 max-w-lg border-4 border-black bg-white/30 px-4 py-2.5 text-xs font-bold leading-5 text-black shadow-[5px_5px_0px_0px_#000] backdrop-blur-[2px] sm:text-[13px]">
                {activeSlide.description || c?.fallbackDesc || "围绕绝区零代理人 MOD 构建的高速直链分站。"}
              </p>
            </div>
          </MotionReveal>

          <div
            className={`mt-2.5 flex flex-wrap gap-2 transition-all duration-[1200ms] ease-out transform ${
              isLoaded ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95"
            }`}
            style={{ transitionDelay: "500ms" }}
          >
            <MotionReveal delay={0.22} rotate={-1}>
              <Link href={game.nav.mods} className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(2px)' }}>
                {c?.browseLabel ?? "Browse Mods"}<ArrowRight className="size-4" />
              </Link>
            </MotionReveal>
            <MotionReveal delay={0.26} rotate={1}>
              <Link href={game.nav.guide} className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(2px)' }}>
                {c?.guideLabel ?? "XXMI Guide"}<Download className="size-4" />
              </Link>
            </MotionReveal>
          </div>
        </div>

        <MotionReveal delay={0.18} y={32} rotate={1} className="hidden lg:block">
          <aside className="rotate-1 border-4 border-black bg-white/20 p-3 text-black shadow-[8px_8px_0px_0px_#000] backdrop-blur-[2px]">
            <div className="mb-3 inline-flex items-center gap-2 border-4 border-black bg-[var(--neo-secondary)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] shadow-[4px_4px_0px_0px_#000]">
              <Bell className="size-3.5" /> {c?.updateBadge ?? "New Update"}&nbsp; {activeSlide.version}
            </div>
            <h2 className="text-2xl font-black uppercase leading-none text-black">{activeSlide.character}<br />{c?.featuredSuffix ?? "Featured"}</h2>
            <p className="mt-3 line-clamp-3 text-xs font-bold leading-6 text-black/72">{activeSlide.title}</p>
            <Link href={activeSlide.href} className="neo-button-outline mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(2px)' }}>
              {c?.exploreLabel ?? "Explore Now"}<ArrowRight className="size-4" />
            </Link>
          </aside>
        </MotionReveal>
      <div className="flex items-center gap-2 ">
        <span className="text-xs font-black tracking-[0.18em] text-white">{String(current + 1).padStart(2, "0")}</span>
        <div className="flex items-center gap-1.5">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setCurrent(index)}
              className={`h-2.5 border-2 border-black transition-all duration-150 ${index === current ? "w-12 bg-[var(--neo-accent)] shadow-[3px_3px_0px_0px_#000]" : "w-7 bg-white/70 hover:bg-white"}`}
              aria-label={`切换到第 ${index + 1} 张`}
            />
          ))}
        </div>
        <span className="text-xs font-black tracking-[0.18em] text-white/55">{String(total).padStart(2, "0")}</span>
      </div>
      </div>

    </section>
  );
}
