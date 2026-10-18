/** 图片展示视图模式 */
export type ViewMode = "grid" | "line";

/** JSON 配置中的原始图片条目 */
export interface GalleryImage {
  /** 唯一标识，用于 URL 路由（对应 ?image=<id>） */
  id: number;
  /** public/gallery/ 下的文件名，如 "art-001.jpg" */
  filename: string;
  /** 图片描述，用于 alt 属性和无障碍访问 */
  alt: string;
  /** 原始图片宽度（像素） */
  width: number;
  /** 原始图片高度（像素） */
  height: number;
}

/** 经过解析的图片条目，包含运行时计算的衍生字段 */
export interface GalleryImageResolved extends GalleryImage {
  /**
   * 原图 URL。聚焦视图与下载用；配了 COS 就是 COS 直链，
   * 没配（本地开发）则回落到 `/gallery/<文件名>`。
   */
  src: string;
  /**
   * 网格缩略图 URL —— 铺满整页的背景图用这一张。
   *
   * 图库在网格态会**同时**给 192 张图设 src/背景图，直接用原图意味着一次访问
   * 要下 77MB（2026-10-18 实测：图库占首尔机 75% 出向带宽）。缩略图档位见
   * `src/features/gallery/config.ts` 的 GALLERY_THUMB_WIDTH。
   */
  thumbSrc: string;
  /** 宽高比 = width / height */
  aspectRatio: number;
}

/** 网格单元格布局信息 */
export interface GridCellLayout {
  /** 占据列数 */
  colSpan: number;
  /** 占据行数 */
  rowSpan: number;
}

/** 图库状态机状态 */
export interface GalleryState {
  viewMode: ViewMode;
  activeImageIndex: number | null;
}
