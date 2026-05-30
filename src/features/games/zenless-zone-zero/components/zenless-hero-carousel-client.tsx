"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bell, ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";

import type { GameConfig } from "@/config/games";

export type ZenlessHeroSlide = {
  character: string;
  coverImage: string;
  description: string;
  href: string;
  id: string;
  title: string;
  version: string;
};

type ZenlessHeroCarouselClientProps = {
  game: GameConfig;
  slides: ZenlessHeroSlide[];
};

export function ZenlessHeroCarouselClient({ game, slides }: ZenlessHeroCarouselClientProps) {
  const [current, setCurrent] = useState(0);
  const total = slides.length;
  const activeSlide = slides[current] ?? slides[0];

  const previous = () => setCurrent((value) => (value - 1 + total) % total);
  const next = () => setCurrent((value) => (value + 1) % total);

  useEffect(() => {
    if (total <= 1) return;

    const timer = window.setInterval(() => {
      setCurrent((value) => (value + 1) % total);
    }, 5600);

    return () => window.clearInterval(timer);
  }, [total]);

  return (
    <section className="relative h-[50vh] min-h-[430px] overflow-hidden border-b-4 border-black bg-black pt-[58px] text-white">
      <div className="absolute inset-0">
        {activeSlide.coverImage ? (
          <Image
            key={activeSlide.id}
            src={activeSlide.coverImage}
            alt={activeSlide.title}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_68%_36%,var(--neo-accent)_0,transparent_26%),linear-gradient(135deg,#090909_0%,#1b1b1b_48%,#030303_100%)]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.5)_36%,rgba(0,0,0,0.14)_70%,rgba(0,0,0,0.74)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.66)_0%,rgba(0,0,0,0.04)_44%,rgba(0,0,0,0.36)_100%)]" />
        <div className="neo-grid absolute inset-0 opacity-[0.18] mix-blend-screen" />
      </div>

      <button
        type="button"
        onClick={previous}
        className="neo-button-outline absolute left-3 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center bg-white/90 p-0 text-black md:inline-flex"
        aria-label="上一张轮播"
      >
        <ChevronLeft className="size-5" />
      </button>

      <button
        type="button"
        onClick={next}
        className="neo-button-outline absolute right-3 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center bg-white/90 p-0 text-black md:inline-flex"
        aria-label="下一张轮播"
      >
        <ChevronRight className="size-5" />
      </button>

      <div className="relative z-10 mx-auto grid h-full w-full max-w-[1500px] grid-cols-1 items-center gap-4 px-4 pb-12 pt-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-6 xl:grid-cols-[minmax(0,1fr)_310px] 2xl:px-4">
        <div className="max-w-2xl pt-1">
          <div className="mb-2 inline-flex -rotate-1 items-center gap-2 border-4 border-black bg-[var(--neo-accent)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-black shadow-[5px_5px_0px_0px_#000]">
            <Sparkles className="size-3.5" /> Shape Your New Eridu
          </div>

          <h1 className="max-w-2xl text-[2.35rem] font-black uppercase leading-[0.86] tracking-tight text-white drop-shadow-[4px_4px_0px_#000] sm:text-5xl lg:text-[3.45rem] xl:text-[4.05rem]">
            Zenless Zone Zero<br />Mod Hub
          </h1>

          <p className="mt-2 max-w-md text-sm font-black text-white/90 sm:text-base">Explore. Customize. Download Fast.</p>
          <p className="mt-1.5 max-w-lg border-4 border-black bg-white/92 px-4 py-2.5 text-xs font-bold leading-5 text-black shadow-[5px_5px_0px_0px_#000] sm:text-[13px]">
            {activeSlide.description || "围绕绝区零代理人 MOD 构建的高速直链分站，保留本站硬边框、强阴影与高对比游戏风格。"}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link href={game.nav.mods} className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em]">
              Browse Mods<ArrowRight className="size-4" />
            </Link>
            <Link href={game.nav.guide} className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em]">
              XXMI Guide<Download className="size-4" />
            </Link>
          </div>
        </div>

        <aside className="hidden rotate-1 border-4 border-black bg-[var(--neo-panel)] p-3 text-black shadow-[8px_8px_0px_0px_#000] lg:block">
          <div className="mb-3 inline-flex items-center gap-2 border-4 border-black bg-[var(--neo-secondary)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] shadow-[4px_4px_0px_0px_#000]">
            <Bell className="size-3.5" /> New Update&nbsp; {activeSlide.version}
          </div>
          <h2 className="text-2xl font-black uppercase leading-none text-black">{activeSlide.character}<br />Featured</h2>
          <p className="mt-3 line-clamp-3 text-xs font-bold leading-6 text-black/72">{activeSlide.title}</p>
          <Link href={activeSlide.href} className="neo-button-outline mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]">
            Explore Now<ArrowRight className="size-4" />
          </Link>
        </aside>
      </div>

      <div className="absolute bottom-3 left-4 z-20 flex items-center gap-2 sm:left-5 lg:left-6 2xl:left-[max(1rem,calc((100vw-1500px)/2+1rem))]">
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
    </section>
  );
}
