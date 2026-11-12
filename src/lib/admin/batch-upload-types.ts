export const BATCH_DRIVE_PLATFORMS = ["夸克网盘", "迅雷网盘"] as const;

export type BatchDrivePlatform = (typeof BATCH_DRIVE_PLATFORMS)[number];

export type BatchDriveLink = {
  platform: BatchDrivePlatform;
  url: string;
  /** 同一帖子的附件变体标签；批量导入目前不产生它，编辑已有合并卡时会被保留 */
  variant?: string;
};

export type BatchRowStatus =
  | "new"
  | "existing"
  | "unknown-character"
  | "missing-link";

/**
 * 预览表里的一张待上传图片。
 *
 * `id` 给 React / dnd-kit 当稳定标识；`original` 是打码前的原图（按项保存，
 * 不靠下标对齐 —— 删图和拖拽换序后下标会变）；`censored` 标记当前是否用了打码版本。
 */
export type BatchPreviewImage = {
  id: string;
  file: File;
  original: File;
  censored: boolean;
};

/** 浏览器预览表里的一行（含尚未上传的本地图片） */
export type BatchUploadRow = {
  id: string;
  /** CSV/txt 里的原始分享名（已去 .exe），用于图片匹配与去重 */
  sourceKey: string;
  title: string;
  character: string;
  version: string;
  gameVersion: string;
  description: string;
  nsfw: boolean;
  driveLinks: BatchDriveLink[];
  images: string[];
  /** 当前要上传的图片，顺序即最终顺序（第 0 张是主图） */
  previewImages: BatchPreviewImage[];
  /** 同帖多版本：变体标签 → 该变体的图片。普通行不填 */
  variantImages?: Record<string, BatchPreviewImage[]>;
  /** 合并行的基变体标签（封面与默认选中的版本）；普通行不填 */
  baseVariantLabel?: string;
  include: boolean;
  status: BatchRowStatus;
  /** 用户在预览里改过的字段；服务端只覆盖这些字段 */
  editedFields: string[];
  /** 只有 txt、CSV 里没有的行 */
  txtOnly: boolean;
};

export type BatchUploadInputRow = {
  title: string;
  character: string;
  version: string;
  gameVersion: string;
  description: string;
  nsfw: boolean;
  driveLinks: BatchDriveLink[];
  images: string[];
  /** 同帖多版本：变体标签 → 该变体画廊 URL。普通行不填 */
  variantImages?: Record<string, string[]>;
  editedFields: string[];
};

export type BatchUploadResult = {
  ok: boolean;
  error?: string;
  inserted: number;
  updated: number;
  reshelved: number;
  duplicates: number;
  failed: { title: string; error: string }[];
};
