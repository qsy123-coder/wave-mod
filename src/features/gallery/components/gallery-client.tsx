"use client";

import { Suspense } from "react";
import { Grid3X3, Rows3 } from "lucide-react";

import { GalleryGrid } from "./gallery-grid";
import { GalleryLine } from "./gallery-line";
import { GalleryLightbox } from "./gallery-lightbox";
import { useGalleryUrlSync } from "../hooks/use-gallery-url-sync";
import type { GalleryImageResolved } from "../types";

// =============================================================================
// 内部组件 — 使用 useSearchParams，需要 Suspense 边界
// =============================================================================

function GalleryContent({ images }: { images: GalleryImageResolved[] }) {
  const {
    viewMode,
    activeImageIndex,
    toggleViewMode,
    openImage,
    closeImage,
    goToNext,
    goToPrev,
  } = useGalleryUrlSync(images);

  return (
    <div className="space-y-6">
      {/* ---- 视图切换工具栏 ---- */}
      <div className="hidden items-center gap-2 lg:flex">
        <button
          type="button"
          onClick={viewMode === "grid" ? undefined : toggleViewMode}
          className={`inline-flex items-center gap-2 border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-0.5 ${
            viewMode === "grid"
              ? "bg-[var(--neo-accent)] text-black"
              : "bg-white text-black/70"
          }`}
          aria-label="网格视图"
          aria-pressed={viewMode === "grid"}
        >
          <Grid3X3 className="size-4" />
          网格
        </button>
        <button
          type="button"
          onClick={viewMode === "line" ? undefined : toggleViewMode}
          className={`inline-flex items-center gap-2 border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-0.5 ${
            viewMode === "line"
              ? "bg-[var(--neo-secondary)] text-black"
              : "bg-white text-black/70"
          }`}
          aria-label="行视图"
          aria-pressed={viewMode === "line"}
        >
          <Rows3 className="size-4" />
          行视图
        </button>
      </div>

      {/* ---- 内容区 ---- */}
      {viewMode === "grid" ? (
        <GalleryGrid
          images={images}
          activeImageIndex={activeImageIndex}
          onImageClick={openImage}
        />
      ) : (
        <GalleryLine
          images={images}
          activeImageIndex={activeImageIndex}
          onImageClick={openImage}
        />
      )}

      {/* ---- 灯箱（独立于内容区，始终可覆盖） ---- */}
      <GalleryLightbox
        images={images}
        activeIndex={activeImageIndex}
        onClose={closeImage}
        onNext={goToNext}
        onPrev={goToPrev}
      />
    </div>
  );
}

// =============================================================================
// 骨架屏
// =============================================================================

function GallerySkeleton() {
  return (
    <div className="space-y-6">
      {/* 工具栏骨架 */}
      <div className="hidden gap-2 lg:flex">
        <div className="h-10 w-24 animate-pulse border-4 border-black bg-[var(--neo-muted)]" />
        <div className="h-10 w-24 animate-pulse border-4 border-black bg-[var(--neo-muted)]" />
      </div>
      {/* 网格骨架 */}
      <div className="grid grid-cols-2 gap-3 auto-rows-[180px] sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse border-4 border-black bg-[var(--neo-muted)]"
            style={{
              gridColumn: i % 5 === 0 ? "span 2" : "span 1",
              gridRow: i % 7 === 0 ? "span 2" : "span 1",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// 导出组件 — 提供 Suspense 边界
// =============================================================================

interface GalleryClientProps {
  images: GalleryImageResolved[];
}

/**
 * 图库主客户端组件。
 *
 * 作为 Server Component → Client Component 的边界，
 * GalleryContent 内部使用 useSearchParams() 需要 Suspense。
 *
 * 状态机：
 * - grid  → 2D 网格浏览（默认）
 * - line  → 1D 行浏览（桌面端切换）
 * - 点击图片 → 灯箱打开（任意模式下）
 */
export function GalleryClient({ images }: GalleryClientProps) {
  return (
    <Suspense fallback={<GallerySkeleton />}>
      <GalleryContent images={images} />
    </Suspense>
  );
}
