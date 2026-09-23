import { describe, expect, it } from "vitest";

import { DRIVE_WEB_WARNING, driveCopyTip } from "./cloud-drive";

describe("driveCopyTip", () => {
  it("迅雷：提示在客户端搜索框粘贴，并给出教程图", () => {
    const tip = driveCopyTip("迅雷网盘");
    expect(tip.advice).toContain("迅雷客户端");
    expect(tip.advice).toContain("粘贴");
    expect(tip.tipImage).toBe("/tips/xunlei.png");
  });

  it("夸克：提示客户端会弹出下载框，并给出教程图", () => {
    const tip = driveCopyTip("夸克网盘");
    expect(tip.advice).toContain("夸克网盘客户端");
    expect(tip.tipImage).toBe("/tips/quark.png");
  });

  it("中英文平台名都能识别（库里的 platform 取值不统一）", () => {
    expect(driveCopyTip("Xunlei").tipImage).toBe("/tips/xunlei.png");
    expect(driveCopyTip("夸克").tipImage).toBe("/tips/quark.png");
  });

  it("其它网盘：给通用户文案，不硬塞不存在的教程图", () => {
    const tip = driveCopyTip("百度网盘");
    expect(tip.advice).toContain("百度网盘");
    expect(tip.tipImage).toBeNull();
  });

  it("每种平台都提醒别在网页里直接打开", () => {
    for (const platform of ["迅雷网盘", "夸克网盘", "百度网盘", "123网盘"]) {
      expect(driveCopyTip(platform).warning).toBe(DRIVE_WEB_WARNING);
    }
  });
});
