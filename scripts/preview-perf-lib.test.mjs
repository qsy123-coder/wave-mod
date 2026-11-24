import { describe, expect, it } from "vitest";

import { buildThumbUrl, computeRequiredWidth, parseAttrs, pickSrcsetCandidate } from "./preview-perf-lib.mjs";

const SRCSET =
  "https://img.example.com/a.webp?imageMogr2/thumbnail/640x%3E/format/webp 640w, " +
  "https://img.example.com/a.webp?imageMogr2/thumbnail/960x%3E/format/webp 960w, " +
  "https://img.example.com/a.webp?imageMogr2/thumbnail/1280x%3E/format/webp 1280w, " +
  "https://img.example.com/a.webp?imageMogr2/thumbnail/1920x%3E/format/webp 1920w";

describe("pickSrcsetCandidate", () => {
  it("取不小于所需宽度的最小候选", () => {
    expect(pickSrcsetCandidate(SRCSET, 1179).width).toBe(1280);
    expect(pickSrcsetCandidate(SRCSET, 960).width).toBe(960);
    expect(pickSrcsetCandidate(SRCSET, 500).width).toBe(640);
  });

  it("超过最大档时取最大档（浏览器会放大）", () => {
    expect(pickSrcsetCandidate(SRCSET, 4000).width).toBe(1920);
  });

  it("候选顺序打乱也能正确排序", () => {
    const reversed = SRCSET.split(", ").reverse().join(", ");
    expect(pickSrcsetCandidate(reversed, 900).width).toBe(960);
  });

  it("空值返回 null", () => {
    expect(pickSrcsetCandidate("", 800)).toBeNull();
    expect(pickSrcsetCandidate(undefined, 800)).toBeNull();
  });
});

describe("computeRequiredWidth（sizes 语义）", () => {
  const HERO_SIZES = "(max-width: 640px) 100vw, 720px";

  it("手机命中 100vw，按 DPR 放大", () => {
    expect(computeRequiredWidth(HERO_SIZES, 393, 3)).toBe(1179);
  });

  it("桌面落到 720px 固定值，按 DPR 放大", () => {
    expect(computeRequiredWidth(HERO_SIZES, 1280, 2)).toBe(1440);
  });

  it("多段媒体条件只取第一条命中的", () => {
    const sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 18vw";
    expect(computeRequiredWidth(sizes, 600, 2)).toBe(600);
    expect(computeRequiredWidth(sizes, 900, 2)).toBe(594);
    expect(computeRequiredWidth(sizes, 1440, 2)).toBe(518);
  });

  it("只有固定像素时直接用", () => {
    expect(computeRequiredWidth("56px", 393, 3)).toBe(168);
  });
});

describe("parseAttrs", () => {
  it("属性名大小写不敏感（React 输出 imageSrcSet / 浏览器序列化会变）", () => {
    const attrs = parseAttrs('<link rel="preload" as="image" imageSrcSet="a 1w" imageSizes="720px">');
    expect(attrs.rel).toBe("preload");
    expect(attrs.imagesrcset).toBe("a 1w");
    expect(attrs.imagesizes).toBe("720px");
  });
});

describe("buildThumbUrl", () => {
  it("拼 160 档并处理已有查询串", () => {
    expect(buildThumbUrl("https://img.example.com/a.webp", 160)).toBe(
      "https://img.example.com/a.webp?imageMogr2/thumbnail/160x%3E/format/webp",
    );
    expect(buildThumbUrl("https://img.example.com/a.webp?_retry=1", 160)).toContain("&imageMogr2/thumbnail/160x%3E");
  });

  it("已有 imageMogr2 的地址原样返回（幂等）", () => {
    const transformed = "https://img.example.com/a.webp?imageMogr2/thumbnail/320x%3E/format/webp";
    expect(buildThumbUrl(transformed, 160)).toBe(transformed);
  });
});
