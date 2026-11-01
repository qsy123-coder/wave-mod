export const BATCH_DRIVE_PLATFORMS = ["夸克网盘", "迅雷网盘"] as const;

export type BatchDrivePlatform = (typeof BATCH_DRIVE_PLATFORMS)[number];

export type BatchDriveLink = {
  platform: BatchDrivePlatform;
  url: string;
};

export type BatchRowStatus =
  | "new"
  | "existing"
  | "unknown-character"
  | "missing-link";

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
  imageFiles: File[];
  /** 打码前的原图，用于「还原」；imageFiles 是当前要上传的版本 */
  originalImageFiles: File[];
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
