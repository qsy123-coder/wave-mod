"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

import { COS_IMG_HERO, COS_IMG_THUMB, withCosImageTransform } from "@/lib/cos/shared";
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
 * 详情抽屉顶部的预览画廊：**同一时刻只展示一张图**，左右箭头循环切换，
 * 下方保留一排可点缩略图。参考 huanmod 详情页「图在信息上面」的阅读顺序。
 *
 * 几个刻意的选择：
 * - 画框**固定高度 + object-contain**：这批预览图宽高比差异很大，按图片自适应
 *   会让切换时整个抽屉上下跳；固定画框只换内容，视觉稳定。
 * - 图片本身是按钮：点击进灯箱；左右箭头是兄弟节点，避免按钮嵌套按钮。
 * - 单图时不显示箭头/计数/缩略图条，避免「1 / 1」这类没有信息量的装饰。
 * - `sizes` 按抽屉宽度给：手机是全宽，桌面抽屉是 45% 宽。
 */
export function DrawerPreviewGallery({
  images,
  title,
  index,
  onIndexChange,
  onOpenImage,
}: DrawerPreviewGalleryProps) {
  const count = images.length;

  if (count === 0) {
    return (
      <div className="flex h-[40vh] min-h-[220px] items-center justify-center border-4 border-black bg-white text-black/40">
        <div className="flex flex-col items-center gap-2">
          <ImageIcon className="size-8" />
          <span className="text-[11px] font-black uppercase tracking-[0.14em]">暂无预览图</span>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(Math.max(index, 0), count - 1);
  const current = images[safeIndex]!;

  const goPrev = () => onIndexChange((safeIndex - 1 + count) % count);
  const goNext = () => onIndexChange((safeIndex + 1) % count);

  return (
    <div data-slot="drawer-preview-gallery" className="space-y-2">
      <div className="relative h-[44vh] min-h-[260px] max-h-[520px] overflow-hidden border-4 border-black bg-black sm:h-[46vh]">
        <button
          type="button"
          onClick={() => onOpenImage(safeIndex)}
          aria-label="查看大图"
          className="absolute inset-0 cursor-zoom-in"
        >
          {/*
           * 直接给 next/image 的 fill：外层是定位元素，图片按画框居中裁切区域
           * 由 object-contain 保证「不裁也不放大」。
           */}
          <Image
            src={withCosImageTransform(current, COS_IMG_HERO)}
            alt={`${title} 预览 ${safeIndex + 1}`}
            fill
            sizes="(max-width: 640px) 100vw, 45vw"
            loading={safeIndex === 0 ? "eager" : "lazy"}
            unoptimized={isExternalStorageUrl(current ?? "")}
            className="object-contain"
          />
        </button>

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
            <span className="absolute bottom-2 right-2 z-10 border-[3px] border-black bg-white px-2 py-0.5 text-[10px] font-black tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000]">
              {safeIndex + 1} / {count}
            </span>
          </>
        ) : null}
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
                  "relative size-[64px] shrink-0 overflow-hidden border-[3px] bg-black transition",
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
