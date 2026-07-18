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
