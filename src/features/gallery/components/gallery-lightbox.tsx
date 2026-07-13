"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { GalleryImageResolved } from "../types";

interface GalleryLightboxProps {
  images: GalleryImageResolved[];
  activeIndex: number | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

/**
 * 全屏灯箱。
 *
 * 从参考项目 chenglou.me 的 1D mode center-image click 行为移植：
 * - 半透明遮罩 + 毛玻璃背景
 * - 左右边缘点击区域（窗口高度 100%，宽度 15%）切换图片
 * - 键盘：← → 切换、ESC 关闭
 * - 图片计数器和关闭按钮
 * - 点击遮罩关闭
 */
export function GalleryLightbox({
  images,
  activeIndex,
  onClose,
  onNext,
  onPrev,
}: GalleryLightboxProps) {
  const isOpen = activeIndex != null;
  const activeImage = isOpen ? images[activeIndex] : null;

  // 键盘事件 — 从 mod-preview-gallery.tsx 复用 pattern
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowRight":
          e.preventDefault();
          onNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          onPrev();
          break;
      }
    },
    [isOpen, onClose, onNext, onPrev],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // 灯箱打开时禁止页面滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !activeImage) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 遮罩层 — 点击关闭 */}
      <div
        className="absolute inset-0 bg-black/88 backdrop-blur-sm cursor-zoom-out"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 inline-flex size-12 items-center justify-center border-4 border-white bg-black/60 text-white shadow-[6px_6px_0px_0px_rgba(255,255,255,0.25)] transition hover:bg-black/80 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        aria-label="关闭灯箱"
      >
        <X className="size-5" />
      </button>

      {/* 左侧点击区域 — 全高 15% 宽 */}
      <button
        type="button"
        onClick={onPrev}
        className="absolute top-0 left-0 z-10 h-full w-[15%] cursor-pointer group"
        aria-label="上一张"
      >
        <ChevronLeft className="absolute top-1/2 left-4 -translate-y-1/2 size-8 text-white/50 transition group-hover:text-white" />
      </button>

      {/* 右侧点击区域 — 全高 15% 宽 */}
      <button
        type="button"
        onClick={onNext}
        className="absolute top-0 right-0 z-10 h-full w-[15%] cursor-pointer group"
        aria-label="下一张"
      >
        <ChevronRight className="absolute top-1/2 right-4 -translate-y-1/2 size-8 text-white/50 transition group-hover:text-white" />
      </button>

      {/* 图片展示区 */}
      <div className="relative z-10 max-h-[85vh] max-w-[90vw] border-4 border-white shadow-[10px_10px_0px_0px_rgba(255,255,255,0.15)]">
        <Image
          src={activeImage.src}
          alt={activeImage.alt}
          width={activeImage.width}
          height={activeImage.height}
          className="max-h-[85vh] max-w-[90vw] object-contain"
          priority
          draggable={false}
        />
      </div>

      {/* 图片计数器 */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 border-4 border-white bg-black/70 px-4 py-2 text-sm font-black text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
        {activeIndex + 1} / {images.length}
      </div>
    </div>
  );
}
