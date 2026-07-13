"use client";

import { GalleryImage } from "./gallery-image";
import { useOcclusion } from "../hooks/use-occlusion";
import { useGalleryLayout } from "../hooks/use-gallery-layout";
import type { GalleryImageResolved, GridCellLayout } from "../types";

interface GalleryGridProps {
  images: GalleryImageResolved[];
  activeImageIndex: number | null;
  onImageClick: (index: number) => void;
}

/**
 * 单张网格卡片。
 * 使用 Intersection Observer 实现虚拟化：
 * - 视口外 → 仅渲染等比例占位 div
 * - 视口内 → 渲染渐进式图片
 */
function GalleryGridItem({
  image,
  layout,
  index,
  isActive,
  onClick,
}: {
  image: GalleryImageResolved;
  layout: GridCellLayout;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const { ref, inView } = useOcclusion();

  return (
    <div
      ref={ref}
      className="relative cursor-pointer overflow-hidden border-4 border-black bg-[var(--neo-muted)] shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
      style={{
        gridColumn: `span ${layout.colSpan}`,
        gridRow: `span ${layout.rowSpan}`,
        opacity: isActive ? 0 : 1,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`查看图片: ${image.alt}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {inView ? (
        <GalleryImage
          src={image.src}
          alt={image.alt}
          aspectRatio={image.aspectRatio}
        />
      ) : (
        <div
          className="w-full"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        />
      )}
    </div>
  );
}

/**
 * 2D 网格视图。
 *
 * 面积自适应布局：根据每张图片的宽高比分配 grid-column/row span，
 * 使得方形图缩小、竖版图放大，视觉上达到面积平衡。
 *
 * 参考项目 chenglou.me 的 colsBoxMaxSizeXF 和两遍布局算法，
 * 这里用 CSS Grid + 预计算 span 的方式实现同等效果。
 */
export function GalleryGrid({
  images,
  activeImageIndex,
  onImageClick,
}: GalleryGridProps) {
  const layout = useGalleryLayout(images);

  return (
    <div className="grid grid-cols-2 gap-3 auto-rows-[180px] sm:grid-cols-3 lg:grid-cols-4">
      {images.map((image, index) => (
        <GalleryGridItem
          key={image.id}
          image={image}
          layout={layout[index]!}
          index={index}
          isActive={activeImageIndex === index}
          onClick={() => onImageClick(index)}
        />
      ))}
    </div>
  );
}
