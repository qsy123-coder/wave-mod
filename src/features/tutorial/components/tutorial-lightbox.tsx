"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";

import type { TutorialImageResolved } from "../types";
import { useLightboxZoom } from "../hooks/use-lightbox-zoom";

type TutorialLightboxProps = {
  images: TutorialImageResolved[];
  initialIndex: number;
  onClose: () => void;
  onNextChapter?: () => void;
  onIndexChange?: (index: number) => void;
  chapterId: string;
  chapterTitle: string;
};

export function TutorialLightbox({
  images,
  initialIndex,
  onClose,
  onNextChapter,
  onIndexChange,
  chapterId,
  chapterTitle,
}: TutorialLightboxProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    scale,
    offsetX,
    offsetY,
    isZoomed,
    resetZoom,
    handleWheel,
    handleDoubleTap,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useLightboxZoom();

  const total = images.length;
  const activeImage = images[activeIndex];

  // Report viewed index to parent
  useEffect(() => {
    onIndexChange?.(activeIndex);
  }, [activeIndex, onIndexChange]);

  // Report initial index
  useEffect(() => {
    onIndexChange?.(initialIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset zoom when switching images
  useEffect(() => {
    resetZoom();
  }, [activeIndex, resetZoom]);

  const goPrev = useCallback(() => {
    if (isZoomed) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  }, [isZoomed, total]);

  const goNext = useCallback(() => {
    if (isZoomed) return;
    setActiveIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  }, [isZoomed, total]);

  // Attach native non-passive wheel listener to root overlay
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => handleWheel(e, el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!activeImage) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[120] bg-black/88 backdrop-blur-sm"
    >
      {/* Top-left: chapter info */}
      <div className="absolute left-5 top-5 z-[140]">
        <div className="border-4 border-black px-3 py-1.5 font-black tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>
          <span className="text-sm">{chapterId}</span>
          <span className="hidden text-xs sm:inline"> — {chapterTitle}</span>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute right-5 top-5 z-[140] flex items-center gap-3">
        <div className="border-4 border-black bg-white px-4 py-2 font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
          {activeIndex + 1} / {total}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-12 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          aria-label="关闭"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Prev/Next arrows — right arrow hidden on last image (use "下一节" instead) */}
      {!isZoomed && total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-5 top-1/2 z-[140] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[calc(-50%_+_2px)] active:shadow-none"
            aria-label="上一张"
          >
            <ChevronLeft className="size-6" />
          </button>
          {activeIndex < total - 1 && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-5 top-1/2 z-[140] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[calc(-50%_+_2px)] active:shadow-none"
              aria-label="下一张"
            >
              <ChevronRight className="size-6" />
            </button>
          )}
        </>
      )}

      {/* Image area — click background to close, click image for double-tap zoom */}
      <div
        className="absolute inset-0 z-[125] flex items-center justify-center overflow-hidden p-12 sm:p-20"
        onClick={(e) => {
          // Click on the padding area (not the image) → close
          if (e.target === e.currentTarget) {
            onClose();
          } else {
            handleDoubleTap(e);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: isZoomed ? "none" : "auto" }}
      >
        <AnimatePresence mode="wait">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            key={activeIndex}
            src={activeImage.src}
            alt={activeImage.alt}
            referrerPolicy="no-referrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            style={{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
              transition: isZoomed ? "none" : "transform 0.2s ease-out",
              cursor: isZoomed ? "grab" : "default",
            }}
            className="max-h-full max-w-full border-4 border-black object-contain shadow-[10px_10px_0px_0px_#000]"
            draggable={false}
          />
        </AnimatePresence>
      </div>

      {/* Zoom hint */}
      <div className="absolute bottom-5 left-5 z-[140]">
        <div
          className="border-4 border-black px-3 py-1.5 font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          <span className="text-[10px]">滚轮缩放 / 双击放大</span>
        </div>
      </div>

      {/* Next chapter button — shown on last image */}
      {!isZoomed && onNextChapter && activeIndex === total - 1 && (
        <div className="absolute bottom-5 right-5 z-[140]">
          <button
            type="button"
            onClick={onNextChapter}
            className="inline-flex items-center gap-2 border-4 border-black px-4 py-2 font-black uppercase tracking-[0.12em] text-black shadow-[6px_6px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            style={{ background: "var(--neo-accent)" }}
          >
            <span className="text-sm">下一节</span>
            <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
