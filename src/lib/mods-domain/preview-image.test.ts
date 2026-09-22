import { describe, expect, it } from "vitest";

import { fallbackCoverImage } from "./mappers";
import { PLACEHOLDER_PREVIEW_URL, hasPreviewImage, isPlaceholderImage } from "./preview-image";

const REAL_IMAGE =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/%E8%8A%99%E9%9C%B2/id/preview.webp";

describe("isPlaceholderImage", () => {
  it("真图不是占位图", () => {
    expect(isPlaceholderImage(REAL_IMAGE)).toBe(false);
  });

  it("COS 占位图是占位图", () => {
    expect(isPlaceholderImage(PLACEHOLDER_PREVIEW_URL)).toBe(true);
  });

  // images 为空时 mapMod 会拿一张 unsplash 顶替，那张同样不是真预览图
  it("mapMod 的兜底图是占位图", () => {
    expect(isPlaceholderImage(fallbackCoverImage)).toBe(true);
  });

  it("空值算占位图", () => {
    expect(isPlaceholderImage(null)).toBe(true);
    expect(isPlaceholderImage(undefined)).toBe(true);
    expect(isPlaceholderImage("")).toBe(true);
  });

  // 常量失配时的最后一道：占位图的对象键里恒含 placeholder/
  it("键里带 placeholder 的一律算占位图", () => {
    expect(isPlaceholderImage("https://other-bucket.cos.ap-shanghai.myqcloud.com/placeholder/x.webp")).toBe(true);
  });
});

describe("hasPreviewImage", () => {
  it("首图是真图 → 有预览图", () => {
    expect(hasPreviewImage([REAL_IMAGE])).toBe(true);
    expect(hasPreviewImage([REAL_IMAGE, PLACEHOLDER_PREVIEW_URL])).toBe(true);
  });

  it("首图是占位图 → 没有预览图（后面挂着真图也不算，卡片上显示的就是首图）", () => {
    expect(hasPreviewImage([PLACEHOLDER_PREVIEW_URL, REAL_IMAGE])).toBe(false);
  });

  it("首图是兜底图 → 没有预览图", () => {
    expect(hasPreviewImage([fallbackCoverImage])).toBe(false);
  });

  it("没有图（空数组 / 缺字段）→ 没有预览图", () => {
    expect(hasPreviewImage([])).toBe(false);
    expect(hasPreviewImage(null)).toBe(false);
    expect(hasPreviewImage(undefined)).toBe(false);
  });
});
