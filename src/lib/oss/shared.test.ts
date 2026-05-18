import { describe, expect, it } from "vitest";

import {
  buildOssPublicUrl,
  buildOssUploadUrl,
  formatOssFileSize,
  getOssMaxUploadBytes,
  getOssUploadCategory,
  normalizeOssEndpoint,
  OSS_MAX_IMAGE_BYTES,
  OSS_MAX_ZIP_BYTES,
  sanitizeOssFilename,
} from "./shared";

describe("OSS shared helpers", () => {
  it("normalizes endpoints and builds OSS URLs", () => {
    expect(normalizeOssEndpoint("https://oss-cn-hangzhou.aliyuncs.com/")).toBe("oss-cn-hangzhou.aliyuncs.com");
    expect(buildOssUploadUrl({ bucket: "wave-mod", endpoint: "https://oss-cn-hangzhou.aliyuncs.com/" })).toBe("https://wave-mod.oss-cn-hangzhou.aliyuncs.com");
    expect(buildOssPublicUrl({ bucket: "wave-mod", endpoint: "oss-cn-hangzhou.aliyuncs.com", objectKey: "mods/test/a.zip" })).toBe("https://wave-mod.oss-cn-hangzhou.aliyuncs.com/mods/test/a.zip");
  });

  it("sanitizes filenames while keeping extension", () => {
    expect(sanitizeOssFilename("My Fancy MOD v1.0.zip")).toBe("my-fancy-mod-v1-0.zip");
    expect(sanitizeOssFilename("中文文件名.png")).toBe("mod-package.png");
  });

  it("detects upload categories from content type", () => {
    expect(getOssUploadCategory("image/webp")).toBe("image");
    expect(getOssUploadCategory("application/zip")).toBe("zip");
    expect(getOssUploadCategory("text/plain")).toBeNull();
  });

  it("returns upload size limits and readable labels", () => {
    expect(getOssMaxUploadBytes("image")).toBe(OSS_MAX_IMAGE_BYTES);
    expect(getOssMaxUploadBytes("zip")).toBe(OSS_MAX_ZIP_BYTES);
    expect(formatOssFileSize(OSS_MAX_IMAGE_BYTES)).toBe("20MB");
    expect(formatOssFileSize(OSS_MAX_ZIP_BYTES)).toBe("2GB");
  });
});
