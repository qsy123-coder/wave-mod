import { describe, expect, it } from "vitest";

import { buildImageVariantUrl, buildWarmUrls } from "./tencent-cdn.mjs";

const cos = (name) =>
  `https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/mod/abc/${name}.webp`;

describe("buildImageVariantUrl", () => {
  it("COS 原图 → CDN 档位地址，只缩不放", () => {
    expect(buildImageVariantUrl(cos("preview"), 320)).toBe(
      "https://cdn.sunnyrose.xyz/mods/mod/abc/preview.webp?imageMogr2/thumbnail/320x%3E/format/webp",
    );
  });

  it("原图已带查询串时用 & 拼接", () => {
    expect(buildImageVariantUrl(`${cos("preview")}?v=2`, 960)).toContain(
      "preview.webp?v=2&imageMogr2/thumbnail/960x%3E/format/webp",
    );
  });

  it("非 COS 地址 / 已变换过的地址返回 null（不该进预热队列）", () => {
    expect(buildImageVariantUrl("https://images.unsplash.com/photo-1", 320)).toBeNull();
    expect(buildImageVariantUrl("/character-imgs/jinxi.webp", 320)).toBeNull();
    expect(buildImageVariantUrl(`${cos("preview")}?imageMogr2/thumbnail/800x%3E/format/webp`, 320)).toBeNull();
    expect(buildImageVariantUrl(null, 320)).toBeNull();
  });

  it("占位图不预热", () => {
    const placeholder =
      "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";
    expect(buildImageVariantUrl(placeholder, 320)).toBeNull();
  });

  it("可以用 --base 覆盖 CDN 域名", () => {
    expect(buildImageVariantUrl(cos("preview"), 800, { base: "https://img.example.com/" })).toBe(
      "https://img.example.com/mods/mod/abc/preview.webp?imageMogr2/thumbnail/800x%3E/format/webp",
    );
  });
});

describe("buildWarmUrls", () => {
  const mod = {
    images: [cos("img1"), cos("img2"), cos("img3")],
    variant_images: { SFW: [cos("v1"), cos("v2")] },
  };

  it("首图与变体首图按全部档位，其余图只预热缩略图", () => {
    const urls = buildWarmUrls([mod], { widths: [320, 960, 1280], thumbWidth: 320 });

    // hero：img1 + v1 各 3 档 = 6；缩略图：img1/img2/img3 各 320 = 3；img1-320 与 hero 重复 → 8
    expect(urls).toHaveLength(8);
    for (const path of ["/img1.webp", "/img2.webp", "/img3.webp", "/v1.webp"]) {
      expect(urls.some((u) => u.includes(path) && u.includes("thumbnail/320x"))).toBe(true);
    }
    expect(urls.some((u) => u.includes("/img1.webp") && u.includes("thumbnail/1280x"))).toBe(true);
    expect(urls.some((u) => u.includes("/v1.webp") && u.includes("thumbnail/1280x"))).toBe(true);
    // 非首图不预热大档
    expect(urls.some((u) => u.includes("/img2.webp") && u.includes("thumbnail/1280x"))).toBe(false);
    // 变体里第 2 张也不是首图
    expect(urls.some((u) => u.includes("/v2.webp") && u.includes("thumbnail/960x"))).toBe(false);
  });

  it("没有任何图片时返回空数组", () => {
    expect(buildWarmUrls([])).toEqual([]);
    expect(buildWarmUrls([{ images: [] }])).toEqual([]);
    expect(buildWarmUrls([{ images: ["https://images.unsplash.com/x"] }])).toEqual([]);
  });
});
