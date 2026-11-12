/**
 * 覆盖更新分支的回归测试。
 *
 * 这里测的是**行为契约**，不是 SQL 文本：2026-11-13 那两个 bug 都属于
 * 「SQL 语法完全正确、跑起来也不报错，但数据被静默写坏」，所以必须把
 * 「什么情况下写、什么情况下不写」这条规则钉死。
 */
import { describe, expect, it } from "vitest";

import {
  hasRealImages,
  mergeDriveLinksByPlatform,
  PLACEHOLDER_IMAGE_URL,
  shouldUpdateVariantImages,
} from "./batch-upload-merge";

describe("回归：覆盖更新不该丢数据", () => {
  it("没选本地图片 ⇒ 不覆盖 images（旧图保留）", () => {
    // 前端现在传空数组；即便传了占位图，也必须判成「没选图」
    expect(hasRealImages([])).toBe(false);
    expect(hasRealImages([PLACEHOLDER_IMAGE_URL])).toBe(false);
  });

  it("只给了夸克 ⇒ 旧迅雷链接必须保留", () => {
    const existing = [
      { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/OLD" },
      { platform: "迅雷网盘" as const, url: "https://pan.xunlei.com/s/OLD" },
    ];
    const merged = mergeDriveLinksByPlatform(existing, [
      { platform: "夸克网盘" as const, url: "https://pan.quark.cn/s/NEW" },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.some((l) => l.platform === "迅雷网盘")).toBe(true);
  });

  it("新建（库里没有这条）时 images 为空要补占位图 —— 这条由服务端 insert 分支负责", () => {
    // hasRealImages 为 false 时，insert 分支写 PLACEHOLDER_IMAGE_URL；
    // 这里只锁住判据，避免哪天有人把 insert 的兜底删了。
    expect(hasRealImages([])).toBe(false);
    expect(PLACEHOLDER_IMAGE_URL).toContain("/placeholder/");
  });

  it("变体画廊同理：空对象或只有占位图时不覆盖", () => {
    expect(shouldUpdateVariantImages({})).toBe(false);
    expect(shouldUpdateVariantImages({ Slim: [] })).toBe(false);
    expect(shouldUpdateVariantImages({ Slim: [PLACEHOLDER_IMAGE_URL] })).toBe(false);
  });
});
