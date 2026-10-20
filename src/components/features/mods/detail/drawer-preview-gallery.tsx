"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useCallback, useState } from "react";

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

/** 竖图的最大展示高度：超过这个高度整张等比缩到框内，避免把下载区推出几屏 */
const PORTRAIT_MAX_HEIGHT = "62vh";

/**
 * 详情抽屉的预览画廊：**同一时刻只展示一张图**，左右箭头循环切换，
 * 下方保留一排可点缩略图。
 *
 * 尺寸策略（2026-10-20 重构，见 docs/mod-detail-sheet-refactor-prd.md）：
 * - **横图**：宽度撑满内容区、高度按原始比例自动 —— 画框就是图片本身，上下不留白。
 * - **竖图**：整张等比缩进 `${PORTRAIT_MAX_HEIGHT}`，宽度由高度反推、画框居中收窄。
 * - 两种分支都靠图片加载后读 `naturalWidth / naturalHeight` 判定；未测到比例前先按
 *   「撑满 + object-contain + 限高」渲染，加载完再切分支，不会出现拉伸变形。
 * - 旧版用固定高度画框是为了多图切换时抽屉不跳；本次明确选择「按图自适应、接受高度变化」。
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

  // 缓存命中时 `load` 可能在 React 挂载前就触发，`onLoad` 不会再被调用 ——
  // 用 ref 回调在元素挂载时补读一次（与 mod-card 的做法一致）。
  const readRatio = useCallback((img: HTMLImageElement | null) => {
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setRatio(img.naturalWidth / img.naturalHeight);
    }
  }, []);

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

  const safeIndex = Math.min(Math.max(index, 0), count - 1);
  const current = images[safeIndex]!;

  const goPrev = () => onIndexChange((safeIndex - 1 + count) % count);
  const goNext = () => onIndexChange((safeIndex + 1) % count);

  // 宽/高 < 1 视为竖图。还没测到时按横图处理（宽度不受 `w-auto` 塌陷影响）
  const isPortrait = ratio !== null && ratio < 1;

  return (
    <div data-slot="drawer-preview-gallery" className="space-y-2">
      {/* 单层画框：黑边直接贴图（旧版是「奶油底 padding + 内层黑框」两层，横图上下会攒出两层浅色留白） */}
      <div data-slot="drawer-preview-card" className="flex justify-center">
        <div
          data-slot="drawer-preview-frame"
          className={cn(
            "relative border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]",
            isPortrait ? "w-auto max-w-full" : "w-full",
          )}
        >
          {/*
           * `w-full` 必须给按钮：表单控件即便 `display: block`，auto 宽度也是 fit-content
           * 而不是铺满 —— 漏掉它横图只会按自身固有宽度渲染，画框两侧各空出一块。
           */}
          <button
            type="button"
            onClick={() => onOpenImage(safeIndex)}
            aria-label="查看大图"
            className={cn("block cursor-zoom-in", isPortrait ? "w-auto" : "w-full")}
          >
            {/*
             * 原生 <img> 而不是 next/image：站点要自定义 COS srcset，而 next/image 会把
             * 自定义 srcSet 丢掉（见 lib/cos/shared.ts 的说明）。`key` 让换图时重新挂载，
             * ref 回调才能重新量到新图的真实比例。
             */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current}
              ref={readRatio}
              onLoad={(e) => readRatio(e.currentTarget)}
              src={withCosImageTransform(current, COS_IMG_HERO) ?? current}
              srcSet={cosImageSrcSet(current, COS_IMG_SRCSET)}
              sizes="(max-width: 640px) 100vw, 720px"
              alt={`${title} 预览 ${safeIndex + 1}`}
              loading={safeIndex === 0 ? "eager" : "lazy"}
              className={cn(
                "block",
                isPortrait
                  ? "w-auto max-w-full object-contain"
                  : "h-auto w-full",
                // 比例未测到时的兜底：撑满但限制高度，绝不拉伸
                ratio === null && "max-h-[62vh] object-contain",
              )}
              style={isPortrait ? { height: PORTRAIT_MAX_HEIGHT } : undefined}
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
                className="absolute left-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center border-[3px] border-black bg-white/95 text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[calc(-50%+2px)] active:shadow-none"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="下一张预览"
                className="absolute right-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center border-[3px] border-black bg-white/95 text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[calc(-50%+2px)] active:shadow-none"
              >
                <ChevronRight className="size-5" />
              </button>
              <span className="absolute left-2 top-2 z-10 border-[3px] border-black bg-white px-2 py-0.5 text-[10px] font-black tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000]">
                {safeIndex + 1} / {count}
              </span>
            </>
          ) : null}
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
                  "relative size-[64px] shrink-0 overflow-hidden border-[3px] bg-[#fff8ef] transition",
                  active
                    ? "border-[#ff7a7a] shadow-[3px_3px_0px_0px_#000]"
                    : "border-black opacity-70 hover:opacity-100",
                )}
              >
                <Image
                  src={withCosImageTransform(src, COS_IMG_THUMB)}
                  alt=""
                  fill
                  sizes="64px"
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
