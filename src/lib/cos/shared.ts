export const COS_MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

export const COS_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** STS 临时密钥有效期（秒），COS 上传最长 1800-7200 秒 */
export const COS_STS_DURATION_SECONDS = 1800;

/**
 * 构建 COS 公开访问 URL。
 * 格式：https://{bucket}.cos.{region}.myqcloud.com/{objectKey}
 */
export function buildCosPublicUrl({
  bucket,
  region,
  objectKey,
}: {
  bucket: string;
  region: string;
  objectKey: string;
}) {
  // 兼容已带 appid 后缀的 bucket（如 my-bucket-1234567890）
  const b = bucket.trim();
  const r = region.trim();
  return `https://${b}.cos.${r}.myqcloud.com/${objectKey}`;
}

/**
 * 判断 URL 是否是腾讯云 COS 的公开对象地址
 */
export function isCosStorageUrl(url: string): boolean {
  return url.includes(".cos.") && url.includes(".myqcloud.com/");
}

/**
 * 构建 COS 对象路径（与 Supabase Storage 路径结构保持一致）。
 * 格式：mods/{safe-char}/{modId}/{filename}
 */
export function buildCosObjectKey({
  character,
  modId,
  filename,
}: {
  character: string;
  modId: string;
  filename: string;
}) {
  const safeChar =
    character
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "mod";

  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base =
    (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

  return `mods/${safeChar}/${modId}/${base || "mod-image"}${ext}`;
}

/**
 * 构建教程图片的 COS 对象路径。
 * 格式：tutorial/{chapter-key}/{modId}/{filename}
 */
export function buildTutorialObjectKey({
  chapterKey,
  modId,
  filename,
}: {
  chapterKey: string;
  modId: string;
  filename: string;
}) {
  const safeChapter = chapterKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10) || "00";

  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base =
    (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

  return `tutorial/${safeChapter}/${modId}/${base || "step-image"}${ext}`;
}

export function formatCosFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10}GB`;
  }

  return `${Math.round(bytes / 1024 / 1024)}MB`;
}
