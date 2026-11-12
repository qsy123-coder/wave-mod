import { describe, expect, it } from "vitest";

import {
  hasRealImages,
  mergeDriveLinksByPlatform,
  PLACEHOLDER_IMAGE_URL,
  shouldUpdateVariantImages,
} from "./batch-upload-merge";

const REAL_1 = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/mod/a/preview.webp";
const REAL_2 = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/mod/a/preview-2.webp";

describe("hasRealImages（决定要不要覆盖库里预览图）", () => {
  it("空数组 = 没选图", () => {
    expect(hasRealImages([])).toBe(false);
    expect(hasRealImages(null)).toBe(false);
    expect(hasRealImages(undefined)).toBe(false);
  });

  it("只有占位图 = 没选图（这正是原来那个 bug）", () => {
    // 修复前：长度 1 > 0 ⇒ 判定为「有图」⇒ 把库里 3 张真图换成这张占位图
    expect(hasRealImages([PLACEHOLDER_IMAGE_URL])).toBe(false);
  });

  it("有真图 = 用户真的选了图", () => {
    expect(hasRealImages([REAL_1])).toBe(true);
    expect(hasRealImages([PLACEHOLDER_IMAGE_URL, REAL_1])).toBe(true);
  });

  it("空串不算真图", () => {
    expect(hasRealImages(["", REAL_2])).toBe(true);
    expect(hasRealImages([""])).toBe(false);
  });
});

describe("mergeDriveLinksByPlatform（网盘链接按平台合并）", () => {
  const quarkOld = { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/OLD" };
  const xunleiOld = { platform: "迅雷网盘" as const, url: "https://pan.xunlei.com/s/OLD" };
  const quarkNew = { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/NEW" };

  it("本次只给夸克 ⇒ 迅雷链接必须保留（原来会被整体替换掉）", () => {
    const merged = mergeDriveLinksByPlatform([quarkOld, xunleiOld], [quarkNew]);

    expect(merged).toHaveLength(2);
    expect(merged.find((l) => l.platform === "迅雷网盘")?.url).toBe("https://pan.xunlei.com/s/OLD");
    expect(merged.find((l) => l.platform === "夸克网盘")?.url).toBe("https://pan.quark.cn/s/NEW");
  });

  it("本次给了迅雷 ⇒ 覆盖旧迅雷", () => {
    const xunleiNew = { platform: "迅雷网盘" as const, url: "https://pan.xunlei.com/s/NEW" };
    const merged = mergeDriveLinksByPlatform([quarkOld, xunleiOld], [xunleiNew]);

    expect(merged.find((l) => l.platform === "迅雷网盘")?.url).toBe("https://pan.xunlei.com/s/NEW");
    expect(merged.find((l) => l.platform === "夸克网盘")?.url).toBe("https://pan.quark.cn/s/OLD");
  });

  it("库里没有的旧链接一条不丢（含百度网盘）", () => {
    const baidu = { platform: "百度网盘", url: "https://pan.baidu.com/s/OLD" };
    const merged = mergeDriveLinksByPlatform([baidu, quarkOld], [quarkNew]);

    expect(merged.map((l) => l.platform).sort()).toEqual(["百度网盘", "夸克网盘"].sort());
    expect(merged.some((l) => l.url === "https://pan.baidu.com/s/OLD")).toBe(true);
  });

  it("多变体：同平台不同 variant 是两条独立分享，互不覆盖", () => {
    const slim = { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/SLIM", variant: "Slim" };
    const thicc = { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/THICC", variant: "Thicc" };
    const slimNew = { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/SLIM2", variant: "Slim" };

    const merged = mergeDriveLinksByPlatform([slim, thicc], [slimNew]);

    expect(merged).toHaveLength(2);
    expect(merged.find((l) => l.variant === "Slim")?.url).toBe("https://pan.quark.cn/s/SLIM2");
    expect(merged.find((l) => l.variant === "Thicc")?.url).toBe("https://pan.quark.cn/s/THICC");
  });

  it("没有旧链接时等于直接用新链接", () => {
    expect(mergeDriveLinksByPlatform([], [quarkNew])).toEqual([quarkNew]);
    expect(mergeDriveLinksByPlatform(null, [quarkNew])).toEqual([quarkNew]);
  });

  it("旧链接在前、新链接在后，保持库里原有展示顺序", () => {
    const merged = mergeDriveLinksByPlatform([xunleiOld, quarkOld], [quarkNew]);
    expect(merged[0].url).toBe("https://pan.xunlei.com/s/OLD");
    expect(merged[1].url).toBe("https://pan.quark.cn/s/NEW");
  });
});

describe("shouldUpdateVariantImages", () => {
  it("空对象 = 没动变体画廊，不覆盖", () => {
    expect(shouldUpdateVariantImages({})).toBe(false);
    expect(shouldUpdateVariantImages(undefined)).toBe(false);
  });

  it("只有占位图 = 没动", () => {
    expect(shouldUpdateVariantImages({ Slim: [PLACEHOLDER_IMAGE_URL] })).toBe(false);
  });

  it("有真图就覆盖", () => {
    expect(shouldUpdateVariantImages({ Slim: [REAL_1] })).toBe(true);
  });
});
