export const OSS_UPLOAD_METHOD = "POST";
export const OSS_POLICY_EXPIRES_MS = 15 * 60 * 1000;
export const OSS_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const OSS_MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;

export const OSS_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const OSS_ZIP_CONTENT_TYPES = ["application/zip", "application/x-zip-compressed"] as const;

export type OssUploadCategory = "image" | "zip";

export function normalizeOssEndpoint(endpoint: string) {
  return endpoint.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function buildOssPublicUrl({
  bucket,
  endpoint,
  objectKey,
}: {
  bucket: string;
  endpoint: string;
  objectKey: string;
}) {
  return `https://${bucket}.${normalizeOssEndpoint(endpoint)}/${objectKey}`;
}

export function buildOssUploadUrl({
  bucket,
  endpoint,
}: {
  bucket: string;
  endpoint: string;
}) {
  return `https://${bucket}.${normalizeOssEndpoint(endpoint)}`;
}

export function sanitizeOssFilename(filename: string) {
  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base = (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${base || "mod-package"}${ext}`;
}

export function getOssUploadCategory(contentType: string): OssUploadCategory | null {
  const normalizedContentType = contentType.trim().toLowerCase();

  if ((OSS_IMAGE_CONTENT_TYPES as readonly string[]).includes(normalizedContentType)) {
    return "image";
  }

  if ((OSS_ZIP_CONTENT_TYPES as readonly string[]).includes(normalizedContentType)) {
    return "zip";
  }

  return null;
}

export function getOssMaxUploadBytes(category: OssUploadCategory) {
  return category === "image" ? OSS_MAX_IMAGE_BYTES : OSS_MAX_ZIP_BYTES;
}

export function formatOssFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10}GB`;
  }

  return `${Math.round(bytes / 1024 / 1024)}MB`;
}
