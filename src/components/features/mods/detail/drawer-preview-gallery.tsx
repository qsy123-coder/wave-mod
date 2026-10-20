"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  COS_IMG_HERO,
  COS_IMG_SRCSET,
  COS_IMG_THUMB,
  cosImageSrcSet,
  withCosImageTransform,
} from "@/lib/cos/shared";
import { isExternalStorageUrl } from "@/lib/storage/shared";
import { cn } from "@/lib/utils";

type DrawerPreviewGalleryProps = {
  images: string[];
  title: string;
  /** 当前展示第几张（0 起）。由抽屉持有，灯箱关闭后仍停在同一张 */
  index: number;
  onIndexChange: (index: number) => void;
  /** 点击大图：交给抽屉打开全屏灯箱 */
  onOpenImage: (index: number) => void;
};

/**
 * 竖图高度上限（视口高度的比例）。取值要让「顶栏 + tab + 内容 + 底栏」在 393×852 的手机上
 * 一屏放得下（不出滚动条），比早期版本的 0.62 收了一档；再大就会顶出滚动条。
 */
const PORTRAIT_MAX_VH = 0.46;

/** 淡入时长，与下面 `duration-300` 对齐；多等 20ms 再摘掉垫底图，避免过渡末尾闪一下 */
const FADE_MS = 320;

/** 比例还没测到时的兜底宽高比（16:10），首帧不会塌成一条线 */
const FALLBACK_RATIO = 16 / 10;

/**
 * 详情抽屉的预览画廊：**同一时刻只展示一张图**，左右箭头循环切换，
 * 下方保留一排可点缩略图。
 *
 * 尺寸策略（2026-10-20 重构，见 docs/mod-detail-sheet-refactor-prd.md）：
 * - **横图**：宽度撑满内容区，高度 = 宽度 ÷ 原图比例 —— 画框就是图片本身，上下不留白。
 * - **竖图**：整张等比缩进视口高度的 46%，宽度由高度反推、画框居中收窄。
 * - 画框尺寸由 `aspect-ratio` 决定并带过渡，切换横竖图时抽屉高度是「长过去」而不是跳变。
 *
 * 切换动画：新图加载完成前，旧图以 `object-contain` 垫在下面；新图 load 后淡入（300ms），
 * 淡入结束才摘掉旧图。所以中间不会出现空白帧，也不会闪回奶油底。
 */
export function DrawerPreviewGallery({
  images,
  title,
  index,
  onIndexChange,
  onOpenImage,
}: DrawerPreviewGalleryProps) {
  const count = images.length;
  const [ratio, setRatio] = useState<number | null>(null);
  /** 已经淡入完成、当前真正显示出来的那张（切换期间它就是垫底的旧图） */
  const [displayed, setDisplayed] = useState<string | null>(null);
  /** 新图已经 load、可以开始淡入的那张 */
  const [readySrc, setReadySrc] = useState<string | null>(null);

  // 快速连点时，定时器里要用「最新的那张」，不能闭包住点击时的值
  const latestSrcRef = useRef<string | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 画框尺寸要用像素算，所以得知道「可用宽度」和视口高度（竖图限高按 vh 定）
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardWidth, setCardWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 852 : window.innerHeight,
  );

  useEffect(() => {
    const syncViewport = () => setViewportHeight(window.innerHeight);
    syncViewport();
    window.addEventListener("resize", syncViewport);

    const el = cardRef.current;
    if (!el) return () => window.removeEventListener("resize", syncViewport);

    // 抽屉宽度会随断点变化（手机全宽 / 桌面 45%），所以监听容器本身而不是 window
    const observer = new ResizeObserver((entries) => {
      setCardWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    setCardWidth(el.clientWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  /** 图片加载完成：记录比例 + 开始淡入，淡入结束后把垫底图换成新图 */
  const handleLoaded = useCallback((img: HTMLImageElement | null, src: string) => {
    if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;

    setRatio(img.naturalWidth / img.naturalHeight);
    setReadySrc(src);

    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      // 读 ref 而不是闭包里的 src：连点切换时要停在最后一张
      setDisplayed(latestSrcRef.current);
    }, FADE_MS);
  }, []);

  // 缓存命中时 `load` 可能在 React 挂载前就触发，`onLoad` 不会再被调用 ——
  // 用 ref 回调在元素挂载时补读一次（与 mod-card 的做法一致）。
  const captureRef = useCallback(
    (src: string) => (img: HTMLImageElement | null) => {
      if (img && img.complete && img.naturalWidth > 0) handleLoaded(img, src);
    },
    [handleLoaded],
  );

  const safeIndex = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const current = images[safeIndex]!;

  // 在 effect 里同步 ref：渲染期间写 ref 会被 react-hooks/refs 判为错误
  useEffect(() => {
    latestSrcRef.current = current ?? null;
  }, [current]);

  // hooks 之后才能早退：count 变化会改变 hook 数量，必须放在所有 use* 下面
  if (count === 0) {
    return (
      <div className="border-4 border-black bg-[#fff8ef] p-2 shadow-[6px_6px_0px_0px_#000]">
        <div className="flex h-[40vh] min-h-[220px] items-center justify-center border-[3px] border-black bg-[#fff8ef] text-black/40">
          <div className="flex flex-col items-center gap-2">
            <ImageIcon className="size-8" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em]">暂无预览图</span>
          </div>
        </div>
      </div>
    );
  }

  const goPrev = () => onIndexChange((safeIndex - 1 + count) % count);
  const goNext = () => onIndexChange((safeIndex + 1) % count);

  const activeRatio = ratio ?? FALLBACK_RATIO;
  const isPortrait = activeRatio < 1;
  const showUnderlay = displayed !== null && displayed !== current;

  /**
   * 画框尺寸写成**像素**，靠 `transition-[width,height]` 平滑过渡。
   *
   * 为什么不用 `aspect-ratio` + 过渡：`aspect-ratio` 的插值在部分浏览器里不生效，
   * 换图时会直接跳。改成显式宽高后，横竖切换是「长过去」的，下面同在同一文档流里的
   * 内容（底栏之上的一切）会跟着连续移动，而不是瞬间位移一下。
   */
  const portraitHeight = Math.round(viewportHeight * PORTRAIT_MAX_VH);
  const frameStyle: React.CSSProperties =
    cardWidth > 0
      ? isPortrait
        ? { width: Math.round(portraitHeight * activeRatio), height: portraitHeight }
        : { width: "100%", height: Math.round(cardWidth / activeRatio) }
      : // 还没量到尺寸（首帧）：用 aspect-ratio + minHeight 兜底，避免高度塌成 0
        { aspectRatio: String(activeRatio), minHeight: 160 };

  return (
    <div data-slot="drawer-preview-gallery" className="space-y-2">
      {/* 单层画框：黑边直接贴图，不再套「奶油底 padding + 内层黑框」 */}
      <div ref={cardRef} data-slot="drawer-preview-card" className="flex justify-center">
        <div
          className={cn(
            "border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]",
            isPortrait ? "w-fit max-w-full" : "w-full",
          )}
        >
          <div
            data-slot="drawer-preview-frame"
            className="relative overflow-hidden bg-[#fff8ef] transition-[width,height] duration-300 ease-out"
            style={frameStyle}
          >
            <button
              type="button"
              onClick={() => onOpenImage(safeIndex)}
              aria-label="查看大图"
              className="absolute inset-0 block w-full cursor-zoom-in"
            >
              {/* 垫底：上一张（已完整显示）。新图淡入期间它保证画面不空 */}
              {showUnderlay ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={withCosImageTransform(displayed, COS_IMG_HERO) ?? displayed}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : null}

              {/*
               * 原生 <img> 而不是 next/image：站点要自定义 COS srcset，而 next/image 会把
               * 自定义 srcSet 丢掉（见 lib/cos/shared.ts 的说明）。`key` 让换图时重新挂载，
               * ref 回调才能重新量到新图的真实比例。
               */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current}
                ref={captureRef(current)}
                onLoad={(e) => handleLoaded(e.currentTarget, current)}
                src={withCosImageTransform(current, COS_IMG_HERO) ?? current}
                srcSet={cosImageSrcSet(current, COS_IMG_SRCSET)}
                sizes="(max-width: 640px) 100vw, 720px"
                alt={`${title} 预览 ${safeIndex + 1}`}
                loading={safeIndex === 0 ? "eager" : "lazy"}
                className={cn(
                  "absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-out",
                  readySrc === current ? "opacity-100" : "opacity-0",
                )}
              />
            </button>

            {/* 「点击查看大图」角标：与图 2 一致，压在图片右下角 */}
            <span className="pointer-events-none absolute bottom-2 right-2 border-[3px] border-black bg-white px-2 py-1 text-[10px] font-black tracking-[0.08em] text-black shadow-[3px_3px_0px_0px_#000]">
              点击查看大图
            </span>

            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="上一张预览"
                  className="absolute left-2 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center border-[3px] border-black bg-white/95 text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[calc(-50%+2px)] active:shadow-none"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="下一张预览"
                  className="absolute right-2 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center border-[3px] border-black bg-white/95 text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[calc(-50%+2px)] active:shadow-none"
                >
                  <ChevronRight className="size-4" />
                </button>
                <span className="absolute left-2 top-2 z-10 border-[3px] border-black bg-white px-2 py-0.5 text-[10px] font-black tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000]">
                  {safeIndex + 1} / {count}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {count > 1 ? (
        <div
          data-slot="drawer-preview-thumbs"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {images.map((src, thumbIndex) => {
            const active = thumbIndex === safeIndex;

            return (
              <button
                key={`${src}-${thumbIndex}`}
                type="button"
                onClick={() => onIndexChange(thumbIndex)}
                aria-label={`查看第 ${thumbIndex + 1} 张预览`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative size-[56px] shrink-0 overflow-hidden border-[3px] bg-[#fff8ef] transition",
                  active
                    ? "border-[#ff7a7a] shadow-[3px_3px_0px_0px_#000]"
                    : "border-black opacity-70 hover:opacity-100",
                )}
              >
                <Image
                  src={withCosImageTransform(src, COS_IMG_THUMB)}
                  alt=""
                  fill
                  sizes="56px"
                  unoptimized={isExternalStorageUrl(src ?? "")}
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
