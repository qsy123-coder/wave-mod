import { isCosStorageUrl } from "@/lib/cos/shared";

export const STORAGE_BUCKET = "mod-assets";

export const STORAGE_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const STORAGE_MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

export function buildStoragePath(character: string, modId: string, filename: string) {
  // Supabase Storage (S3-compatible) 要求 object key 仅含 ASCII 安全字符，中文字符需过滤
  const safeChar =
    character
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "mod";

  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base = (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `mods/${safeChar}/${modId}/${base || "mod-image"}${ext}`;
}

export function formatStorageFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10}GB`;
  }

  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

/**
 * 将 Supabase Storage 的公开 object URL 转换为 render/image 转换 URL。
 * Supabase Storage 内置图片转换 API，支持实时转 WebP 和调整尺寸：
 *   https://supabase.com/docs/reference/javascript/storage-from-render
 *
 * 原始 URL:
 *   /storage/v1/object/public/{bucket}/{path}
 * 转换后:
 *   /storage/v1/render/image/public/{bucket}/{path}?format=webp&width=750
 */
export function toSupabaseRenderUrl(
  objectUrl: string,
  options?: { width?: number; height?: number; quality?: number },
): string {
  const width = options?.width ?? 750;
  const quality = options?.quality ?? 80;

  // 只对 Supabase Storage public URL 做转换
  const rendered = objectUrl.replace(
    /\/storage\/v1\/object\/public\//,
    "/storage/v1/render/image/public/",
  );

  if (rendered === objectUrl) {
    // 不是 Supabase Storage URL，原样返回
    return objectUrl;
  }

  const url = new URL(rendered);
  url.searchParams.set("format", "webp");
  url.searchParams.set("width", String(width));
  url.searchParams.set("quality", String(quality));

  return url.toString();
}

/**
 * 判断 URL 是否是 Supabase Storage 的公开 object 地址
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes("/storage/v1/object/public/");
}

/**
 * 判断 URL 是否来自外部存储（Supabase Storage、腾讯云 COS 或阿里云 OSS）。
 * 这些外部 URL 不需要 Next.js Image Optimization，因为：
 * - Supabase Storage 有自带的 render/image 转换 API
 * - 腾讯云 COS 使用原图直出（CDN 加速）
 * - 阿里云 OSS 使用原图直出（CDN 加速）
 */
export function isExternalStorageUrl(url: string): boolean {
  return isSupabaseStorageUrl(url) || isCosStorageUrl(url) || isAliyunOssUrl(url);
}

/**
 * 判断 URL 是否是阿里云 OSS 的公开对象地址。
 * 格式：https://{bucket}.oss-{region}.aliyuncs.com/{path}
 *      https://{bucket}.oss-cn-shanghai.aliyuncs.com/{path}
 */
function isAliyunOssUrl(url: string): boolean {
  return url.includes(".oss-") && url.includes(".aliyuncs.com/");
}
