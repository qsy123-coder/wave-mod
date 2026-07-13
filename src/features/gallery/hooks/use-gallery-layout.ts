"use client";

import { useMemo } from "react";
import type { GalleryImageResolved, GridCellLayout } from "../types";

/**
 * 面积自适应网格布局算法。
 *
 * 核心思想：对于 CSS grid 等宽等高的单元格，
 * colSpan / rowSpan 应近似等于图片宽高比，
 * 使得不同比例的图片在视觉面积上达到平衡。
 *
 * 阈值映射表（从参考项目移植）：
 * | 宽高比范围      | colSpan | rowSpan | 示例          |
 * |----------------|---------|---------|---------------|
 * | >= 2.5         | 2       | 1       | 超宽全景       |
 * | >= 1.4         | 2       | 1       | 16:9 横版      |
 * | >= 0.8         | 1       | 1       | 接近方形       |
 * | >= 0.55        | 1       | 2       | 9:16 竖版      |
 * | < 0.55         | 1       | 3       | 超长竖版       |
 */

/** 单张图片的布局计算 */
export function computeCellLayout(aspectRatio: number): GridCellLayout {
  if (aspectRatio >= 2.5) return { colSpan: 2, rowSpan: 1 };
  if (aspectRatio >= 1.4) return { colSpan: 2, rowSpan: 1 };
  if (aspectRatio >= 0.8) return { colSpan: 1, rowSpan: 1 };
  if (aspectRatio >= 0.55) return { colSpan: 1, rowSpan: 2 };
  return { colSpan: 1, rowSpan: 3 };
}

/** 计算所有图片的网格布局 */
export function computeGridLayout(images: GalleryImageResolved[]): GridCellLayout[] {
  return images.map((img) => computeCellLayout(img.aspectRatio));
}

/** 断点对应的列数 */
export function getGridColumns(breakpoint: "sm" | "md" | "lg"): number {
  switch (breakpoint) {
    case "sm":
      return 2;
    case "md":
      return 3;
    case "lg":
      return 4;
  }
}

/**
 * Hook：根据图片列表计算网格布局。
 * 布局在图片列表变化时重新计算。
 */
export function useGalleryLayout(images: GalleryImageResolved[]) {
  return useMemo(() => computeGridLayout(images), [images]);
}
