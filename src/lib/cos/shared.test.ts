import { describe, expect, it } from "vitest";

import { COS_IMG_CARD, COS_IMG_HERO, COS_IMG_THUMB, withCosImageTransform } from "./shared";

const COS_IMAGE =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/%E8%8A%99%E9%9C%B2/id/preview.webp";

describe("withCosImageTransform", () => {
  it("COS 图拼上 thumbnail 参数", () => {
    expect(withCosImageTransform(COS_IMAGE, COS_IMG_CARD)).toBe(
      `${COS_IMAGE}?imageMogr2/thumbnail/800x%3E/format/webp`,
    );
  });

  it("三档各自拼对宽度", () => {
    expect(withCosImageTransform(COS_IMAGE, COS_IMG_THUMB)).toContain("thumbnail/320x%3E");
    expect(withCosImageTransform(COS_IMAGE, COS_IMG_CARD)).toContain("thumbnail/800x%3E");
    expect(withCosImageTransform(COS_IMAGE, COS_IMG_HERO)).toContain("thumbnail/1280x%3E");
  });

  // 不带 `>` 时数据万象会**放大**小图（实测 2560→4000），所以这个符号不能省
  it("始终带只缩不放的 %3E", () => {
    expect(withCosImageTransform(COS_IMAGE, COS_IMG_CARD)).toContain("%3E");
  });

  // mod-card 失败重试会先拼 `_retry=`，那时 URL 里已经有 `?` 了
  it("已有查询串时用 & 而不是 ?", () => {
    expect(withCosImageTransform(`${COS_IMAGE}?_retry=123`, COS_IMG_THUMB)).toBe(
      `${COS_IMAGE}?_retry=123&imageMogr2/thumbnail/320x%3E/format/webp`,
    );
  });

  it("幂等：已经带 imageMogr2 就不再叠加", () => {
    const once = withCosImageTransform(COS_IMAGE, COS_IMG_CARD);
    expect(withCosImageTransform(once, COS_IMG_HERO)).toBe(once);
  });

  // 这几类 host 不支持 imageMogr2，拼上去会直接坏图
  it("非 COS 地址原样返回", () => {
    const untouched = [
      "https://xqwzgcxwdwpmkdbmzmve.supabase.co/storage/v1/object/public/mod-assets/a.webp",
      "https://images.unsplash.com/photo-1234567890",
      "/character-imgs/jinxi.webp",
      "https://example.com/pic.webp",
    ];
    for (const url of untouched) {
      expect(withCosImageTransform(url, COS_IMG_CARD)).toBe(url);
    }
  });

  it("空值原样返回", () => {
    expect(withCosImageTransform(null, COS_IMG_CARD)).toBeNull();
    expect(withCosImageTransform(undefined, COS_IMG_CARD)).toBeUndefined();
    expect(withCosImageTransform("", COS_IMG_CARD)).toBe("");
  });
});
