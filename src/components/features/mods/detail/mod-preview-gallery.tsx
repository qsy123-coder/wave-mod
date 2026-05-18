"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, ImageIcon, PlayCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";

type PreviewItem =
  | { type: "image"; src: string; alt: string }
  | { type: "video"; src: string; title: string };

type ModPreviewGalleryProps = {
  images: string[];
  title: string;
  videoUrl?: string | null;
};

export function ModPreviewGallery({ images, title, videoUrl }: ModPreviewGalleryProps) {
  const items = useMemo<PreviewItem[]>(() => {
    const imageItems = images.map((src) => ({ type: "image" as const, src, alt: title }));

    if (!videoUrl) {
      return imageItems;
    }

    return [...imageItems, { type: "video" as const, src: videoUrl, title }];
  }, [images, title, videoUrl]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const activeItem = items[activeIndex] ?? items[0];

  const goPrev = useCallback(() => {
    setActiveIndex((current) => (current - 1 + items.length) % items.length);
  }, [items.length]);

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLightboxOpen(false);
      }

      if (event.key === "ArrowLeft") {
        goPrev();
      }

      if (event.key === "ArrowRight") {
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, isLightboxOpen]);

  if (!activeItem) {
    return null;
  }

  return (
    <>
      <section className="min-w-0 space-y-4">
        <div className="neo-card-lg bg-[#fff8ef] p-3">
          <div className="relative overflow-hidden border-4 border-black bg-black">
            {activeItem.type === "image" ? (
              <button type="button" onClick={() => setIsLightboxOpen(true)} className="relative block h-[360px] w-full text-left sm:h-[460px] xl:h-[620px]">
                <Image
                  src={activeItem.src}
                  alt={activeItem.alt}
                  fill
                  priority
                  fetchPriority="high"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover transition-transform duration-300 hover:scale-[1.015]"
                />
              </button>
            ) : (
              <div className="flex h-[360px] w-full flex-col justify-between bg-[#bcaeff] p-6 text-black sm:h-[460px] xl:h-[620px]">
                <div className="inline-flex size-14 items-center justify-center border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]">
                  <PlayCircle className="size-7" />
                </div>
                <div className="max-w-md space-y-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em]">演示视频</p>
                  <h3 className="text-2xl font-black leading-tight">{title}</h3>
                  <p className="text-sm font-bold leading-7 text-black/80">点击右下角按钮前往外部视频页查看完整演示效果。</p>
                  <a
                    href={activeItem.src}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5"
                  >
                    <PlayCircle className="size-4" />前往视频页
                  </a>
                </div>
              </div>
            )}

            {items.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-4 top-1/2 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center border-4 border-black bg-white/95 text-black shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-[calc(50%+2px)]"
                  aria-label="查看上一张预览"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-4 top-1/2 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center border-4 border-black bg-white/95 text-black shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-[calc(50%+2px)]"
                  aria-label="查看下一张预览"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            ) : null}

            <div className="absolute left-4 top-4 inline-flex items-center gap-2 border-4 border-black bg-[#ffd84f] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
              {activeItem.type === "image" ? <Eye className="size-4" /> : <PlayCircle className="size-4" />}
              {activeItem.type === "image" ? "预览主视觉" : "视频演示"}
            </div>

            <div className="absolute bottom-4 right-4 inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
              {activeIndex + 1} / {items.length}
            </div>
          </div>
        </div>

        {items.length > 1 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={`${item.type}-${item.src}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "neo-card p-2 text-left transition duration-150 ease-linear",
                    isActive ? "-translate-y-1 bg-[#ffd84f]" : "bg-[#fff8ef] hover:-translate-y-1",
                  )}
                >
                  <div className="relative overflow-hidden border-4 border-black bg-black">
                    {item.type === "image" ? (
                      <div className="relative h-52 w-full">
                        <Image
                          src={item.src}
                          alt={item.alt}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-52 flex-col justify-between bg-[#bcaeff] p-4 text-black">
                        <div className="inline-flex size-10 items-center justify-center border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
                          <PlayCircle className="size-5" />
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.16em]">演示视频</p>
                          <p className="mt-2 text-sm font-bold leading-6 text-black/75">点击切换到视频预览卡片。</p>
                        </div>
                      </div>
                    )}

                    <div className="absolute left-3 top-3 inline-flex items-center gap-1 border-4 border-black bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0px_0px_#000]">
                      {item.type === "image" ? <ImageIcon className="size-3.5" /> : <PlayCircle className="size-3.5" />}
                      {item.type === "image" ? `图 ${index + 1}` : "视频"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {isLightboxOpen && activeItem.type === "image" ? (
        <div className="fixed inset-0 z-[120] bg-black/88 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute inset-0 h-full w-full cursor-zoom-out"
            aria-label="关闭预览"
          />

          <div className="absolute right-5 top-5 z-[130] flex items-center gap-3">
            <div className="border-4 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
              {activeIndex + 1} / {items.length}
            </div>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="inline-flex size-12 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000]"
              aria-label="关闭大图预览"
            >
              <X className="size-5" />
            </button>
          </div>

          {items.length > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-5 top-1/2 z-[130] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000]"
                aria-label="查看上一张大图"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-5 top-1/2 z-[130] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000]"
                aria-label="查看下一张大图"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}

          <div className="absolute inset-0 z-[125] flex items-center justify-center px-6 py-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeItem.src} alt={activeItem.alt} loading="eager" decoding="async" className="max-h-full max-w-full border-4 border-black object-contain shadow-[10px_10px_0px_0px_#000]" />
          </div>
        </div>
      ) : null}
    </>
  );
}
