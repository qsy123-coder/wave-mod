"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
 * 一屏放得下（不出滚动条），再大就会顶出滚动条。
 */
const PORTRAIT_MAX_VH = 0.46;

/** 切换动画时长。用户 2026-10-20 选定「淡入 + 轻微缩放，~260ms」 */
const SWITCH_MS = 260;

/** 比例还没测到时的兜底宽高比（16:10），占位框不会塌成一条线 */
const FALLBACK_RATIO = 16 / 10;

/**
 * 整卡（黑边 + 硬阴影 + 图片）的入场动画：淡入 + 0.96→1。
 *
 * **为什么把动画放在整卡上、而不是只放图片上**：过渡期间如果只让图片动、边框不动，
 * 图片的缩放曲线和边框的尺寸曲线不同源，看起来就是「边框追着图跑」。整卡一起动则永远同步。
 *
 * **为什么尺寸不做过渡**：宽高同时插值时，画框的宽高比每帧都在变，`object-contain` 会
 * 每帧重新拟合，图片像是自己在放大；而且外层 `flex justify-center` 会让变宽的卡片
 * 从中心偏右「长出来再滑回中心」。用户 2026-10-20 明确选择：尺寸直接切换，只做淡入。
 */
function PreviewCard({ className, style, children, ...rest }: React.ComponentProps<"div">) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // 双 rAF：保证第一帧以「透明 + 96%」真正绘制一次，后续切换才会产生过渡
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  return (
    <div
      className={cn(
        className,
        // Tailwind v4 的 scale-* 走的是独立的 `scale` 属性，不是 transform —— 过渡里必须写上它
        "transition-[opacity,scale] ease-out",
        entered ? "scale-100 opacity-100" : "scale-95 opacity-0",
      )}
      style={{ ...style, transitionDuration: `${SWITCH_MS}ms` }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * 详情抽屉的预览画廊：**同一时刻只展示一张图**，左右箭头循环切换，下方一排缩略图。
 *
 * 尺寸：横图宽度撑满、高度 = 宽 ÷ 比例；竖图限高 46vh、宽度由高度反推、居中收窄。
 *
 * 切换：点箭头后先**后台加载**目标图，拿到真实比例再一次性换内容 + 换尺寸 —— 尺寸跳变
 * 正好发生在整卡透明的那一帧，看不见；换完整卡淡入 + 0.96→1。加载期间旧图原样不动。
 */
export function DrawerPreviewGallery({
  images,
  title,
  index,
  onIndexChange,
  onOpenImage,
}: DrawerPreviewGalleryProps) {
  const count = images.length;

  /** 当前**已经显示出来**的那张（切换时它一直留在屏幕上，直到新图就绪） */
  const [shown, setShown] = useState<string | null>(null);
  /** shown 那张图的真实宽高比 */
  const [ratio, setRatio] = useState<number | null>(null);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const target = images[safeIndex] ?? null;

  /** 目标图加载完成：比例 + 内容一起换，整卡随之重新挂载并播入场动画 */
  const handleLoaded = useCallback((img: HTMLImageElement | null, src: string) => {
    if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    setRatio(img.naturalWidth / img.naturalHeight);
    setShown(src);
  }, []);

  // 首帧还没有任何图时，先把第一张当显示内容；之后只跟着 shown 走
  const shownSrc = shown ?? target;
  const shownIndex = shownSrc ? images.indexOf(shownSrc) : -1;
  // 首帧（还没有任何图）也要预加载，否则占位框会一直停在那里
  const needsPreload = target !== null && (shown === null || shown !== target);
  const activeRatio = ratio ?? FALLBACK_RATIO;
  const isPortrait = activeRatio < 1;

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

  /**
   * 画框尺寸**纯 CSS** 决定，不测量 DOM：
   * - 横图：`w-full` + `aspect-ratio` ⇒ 高度自动跟着容器宽走；
   * - 竖图：高度锁 46vh + `aspect-ratio` ⇒ 宽度反推、外层 `flex justify-center` 居中。
   *
   * 之前用 ResizeObserver 量像素宽度，切换时滚动条出现/消失会让量到的宽度差 18px，
   * 画框在淡入过程中还会二次跳宽（实测 350→360→368）。
   */
  const frameClassName = cn(
    "relative border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]",
    isPortrait ? "w-auto max-w-full" : "w-full",
  );
  const frameStyle: React.CSSProperties = {
    aspectRatio: String(activeRatio),
    ...(isPortrait ? { height: `${PORTRAIT_MAX_VH * 100}vh` } : {}),
  };

  return (
    <div data-slot="drawer-preview-gallery" className="space-y-2">
      {/* 目标图的预加载：透明、不参与布局，只为了拿到真实比例 */}
      {needsPreload ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`preload-${target}`}
          src={withCosImageTransform(target, COS_IMG_HERO) ?? target}
          alt=""
          aria-hidden
          className="hidden"
          ref={(img) => {
            if (img && img.complete) handleLoaded(img, target);
          }}
          onLoad={(e) => handleLoaded(e.currentTarget, target)}
        />
      ) : null}

      <div data-slot="drawer-preview-card" className="flex justify-center">
        {ratio === null || !shownSrc ? (
          // 第一张还没量到比例：先占位，避免用一个错误的兜底比例把画框撑一下再缩回去
          <div className="h-[160px] w-full max-w-[320px] animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
        ) : (
          <PreviewCard
            key={shownSrc}
            data-slot="drawer-preview-frame"
            className={frameClassName}
            style={frameStyle}
          >
            <button
              type="button"
              onClick={() => onOpenImage(safeIndex)}
              aria-label="查看大图"
              className="absolute inset-0 block h-full w-full cursor-zoom-in"
            >
              {/* 原生 <img>：站点要自定义 COS srcset，而 next/image 会丢掉自定义 srcSet */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={withCosImageTransform(shownSrc, COS_IMG_HERO) ?? shownSrc}
                srcSet={cosImageSrcSet(shownSrc, COS_IMG_SRCSET)}
                sizes="(max-width: 640px) 100vw, 720px"
                alt={`${title} 预览 ${shownIndex + 1}`}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </button>

            {/* 「点击查看大图」角标 */}
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
          </PreviewCard>
        )}
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
