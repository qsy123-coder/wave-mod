"use client";

import * as React from "react";
import Autoplay from "embla-carousel-autoplay";

import Link from "next/link";
import { ArrowUpRight, Pause, Play, Star } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { SiteMod } from "@/lib/mods";


type HeroCarouselProps = {
  mods: SiteMod[];
};

export function HeroCarousel({ mods }: HeroCarouselProps) {
  const plugin = React.useRef(
    Autoplay({ delay: 4500, stopOnInteraction: true, stopOnMouseEnter: true }),
  );
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);

  React.useEffect(() => {
    if (!api) return;

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);

    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const toggleAutoplay = () => {
    if (!plugin.current) return;

    if (isPlaying) {
      plugin.current.stop();
      setIsPlaying(false);
      return;
    }

    plugin.current.play();
    setIsPlaying(true);
  };

  if (mods.length === 0) {
    return (
      <MotionReveal delay={0.14} y={32} rotate={2}>
        <div className="neo-card-lg relative rotate-2 p-6 text-black" style={{ background: "var(--neo-panel)" }}>
          <div className="border-4 border-black bg-white px-5 py-8 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">FEATURED DROP</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">首页轮播已接入真实数据</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-black/75">当前还没有可展示的公开 MOD。你可以先去后台发布内容，首页热门轮播会自动展示最新条目。</p>
          </div>
        </div>
      </MotionReveal>
    );
  }

  return (
    <MotionReveal delay={0.14} y={32} rotate={2}>
      <div className="neo-card-lg relative rotate-2 p-3" style={{ background: "var(--neo-panel)" }}>
        <Carousel setApi={setApi} plugins={[plugin.current]} opts={{ loop: mods.length > 1 }}>
          <CarouselContent className="ml-0">
            {mods.map((mod, index) => (
              <CarouselItem key={mod.id} className="pl-0">
                <Link href={`/mods/${mod.id}`} className="group block">
                  <div className="relative h-[500px] w-full overflow-hidden border-4 border-black bg-black md:h-[560px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mod.coverImage}
                      alt={mod.title}
                      loading={index === 0 ? "eager" : "lazy"}
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_18%,rgba(0,0,0,0.16)_55%,rgba(0,0,0,0.42)_100%)] transition-opacity duration-500 group-hover:opacity-90" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/18 to-black/8" />

                    <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2">
                      <Badge className="neo-sticker -rotate-2 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-secondary)]" style={{ background: "var(--neo-secondary)" }}>
                        热门 MOD
                      </Badge>
                      <Badge className={`neo-sticker px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black hover:bg-inherit ${index % 2 === 0 ? "rotate-2" : ""}`} style={{ background: index % 2 === 0 ? "var(--neo-accent)" : "var(--neo-muted)" }}>
                        {mod.character}
                      </Badge>
                    </div>

                    <div className="absolute right-3 top-3 z-20 rotate-2 border-4 border-black bg-[#ffd84f] px-2 py-1.5 shadow-[4px_4px_0px_0px_#000] text-black">
                      <div className="flex items-center gap-1"><Star className="size-3 fill-[#ff7a00] text-[#ff7a00]" /><span className="text-sm font-black leading-none">{mod.ratingAverage.toFixed(1)}</span></div>
                      <p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black/70">{mod.ratingCount} 人评分</p>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-24 text-white">
                      <div className="max-w-lg space-y-2.5">
                        <p className="neo-label text-white/65">FEATURED DROP</p>
                        <h2 className="text-sm font-black uppercase leading-tight tracking-[0.16em] text-white/50 transition-colors group-hover:text-white md:text-base">{mod.title.length > 8 ? `${mod.title.slice(0, 8)}...` : mod.title}</h2>
                        <p className="line-clamp-2 text-xs font-bold leading-5 text-white/78 md:text-sm md:leading-6">{mod.description}</p>
                        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-black/80">
                          <div className="border-2 border-black bg-white/92 px-2.5 py-1.5 shadow-[3px_3px_0px_0px_#000]">浏览 {mod.views}</div>
                          <div className="border-2 border-black bg-white/92 px-2.5 py-1.5 shadow-[3px_3px_0px_0px_#000]">收藏 {mod.favorites}</div>
                        </div>
                      </div>

                      <div className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border-2 border-white/75 bg-black/36 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/92 backdrop-blur-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-white group-hover:bg-black/68 group-hover:text-white group-hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                        查看详情
                        <ArrowUpRight className="size-3.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="left-4 top-1/2 z-30 -translate-y-1/2 border-white/70 bg-white/50 text-black shadow-[3px_3px_0px_0px_#000] backdrop-blur-sm transition-all hover:bg-white hover:shadow-[5px_5px_0px_0px_#000]" />
          <CarouselNext className="right-4 top-1/2 z-30 -translate-y-1/2 border-white/70 bg-white/50 text-black shadow-[3px_3px_0px_0px_#000] backdrop-blur-sm transition-all hover:bg-white hover:shadow-[5px_5px_0px_0px_#000]" />
        </Carousel>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {mods.map((mod, index) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => api?.scrollTo(index)}
                  className={`border-2 border-black transition-all duration-150 ease-linear ${index === current ? "h-2.5 w-12 bg-[var(--neo-accent)] shadow-[3px_3px_0px_0px_#000]" : "h-2.5 w-6 bg-white/85 hover:w-8 hover:bg-white"}`}
                  aria-label={`跳转到 ${mod.title}`}
                />
              ))}
            </div>
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0px_0px_#000]">
              <span className="text-black/55">热门精选</span>
              <span>{String(current + 1).padStart(2, "0")}</span>
              <span className="text-black/45">/</span>
              <span>{String(mods.length).padStart(2, "0")}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleAutoplay}
            className="neo-button-secondary inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em]"
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {isPlaying ? "暂停轮播" : "播放轮播"}
          </button>
        </div>
      </div>
    </MotionReveal>
  );
}
