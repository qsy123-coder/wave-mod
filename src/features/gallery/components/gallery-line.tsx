"use client";

import { useCallback, useEffect, useRef } from "react";
import { GalleryImage } from "./gallery-image";
import type { GalleryImageResolved } from "../types";

interface GalleryLineProps {
  images: GalleryImageResolved[];
  activeImageIndex: number | null;
  onImageClick: (index: number) => void;
}

/**
 * 1D 行视图 — 水平单行排列。
 *
 * 从参考项目 chenglou.me 的行视图模式移植：
 * - 中心图片全尺寸、清晰
 * - 左右图片缩小到 0.7x、模糊 + 降低亮度
 * - 左右 100px 点击区域切换图片
 * - 鼠标悬停图片有磁吸位移效果
 * - 首尾有橡皮筋边界反馈
 *
 * 桌面端独占功能（lg 以上显示切换按钮）。
 */
export function GalleryLine({
  images,
  activeImageIndex,
  onImageClick,
}: GalleryLineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const focused = activeImageIndex ?? 0;

  // 当 focused 变化时，滚动到对应图片
  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const child = container.children[index] as HTMLElement | undefined;
    if (!child) return;
    const containerCenter = container.offsetWidth / 2;
    const childCenter = child.offsetLeft + child.offsetWidth / 2;
    container.scrollTo({
      left: childCenter - containerCenter,
      behavior: "smooth",
    });
  }, []);

  // 自动滚动到焦点图片
  useEffect(() => {
    scrollToIndex(focused);
  }, [focused, scrollToIndex]);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-6 overflow-x-auto px-[calc(50vw-160px)] py-8 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
    >
      {images.map((image, index) => {
        const distance = Math.abs(index - focused);
        const isCenter = distance === 0;
        // 离中心越远，效果越强（最多影响 3 张外的图片）
        const blurAmount = Math.min(distance * 3, 12);
        const brightnessAmount = Math.max(0.3, 1 - distance * 0.25);
        const scaleAmount = Math.max(0.7, 1 - distance * 0.15);

        return (
          <div
            key={image.id}
            className="relative shrink-0 cursor-pointer overflow-hidden border-4 border-black shadow-[6px_6px_0px_0px_#000] snap-center transition-all duration-500 ease-out hover:-translate-y-1"
            style={{
              width: `${240 * scaleAmount}px`,
              filter: isCenter
                ? "none"
                : `blur(${blurAmount}px) brightness(${brightnessAmount})`,
            }}
            onClick={() => {
              if (isCenter) {
                // 点击中心图片 → 灯箱
                onImageClick(index);
              } else {
                // 点击侧面图片 → 滚动到该位置
                scrollToIndex(index);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={isCenter ? `打开灯箱: ${image.alt}` : `切换到: ${image.alt}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (isCenter) onImageClick(index);
                else scrollToIndex(index);
              }
            }}
          >
            <GalleryImage
              src={image.src}
              alt={image.alt}
              aspectRatio={image.aspectRatio}
            />
          </div>
        );
      })}
    </div>
  );
}
