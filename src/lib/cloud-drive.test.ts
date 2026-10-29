import { describe, expect, it } from "vitest";

import { DRIVE_MOBILE_TRANSFER_HINT, DRIVE_WEB_WARNING, driveCopyTip, driveMobileTip } from "./cloud-drive";

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

  it("不唤起客户端的调用方（默认）文案不变：说「打开客户端」而不是「正在尝试打开」", () => {
    // 教程页工具下载复用这份文案但不唤起，措辞不能改成会自动打开 —— 否则那一页在撒谎
    for (const platform of ["迅雷网盘", "夸克网盘", "百度网盘"]) {
      expect(driveCopyTip(platform).advice).not.toContain("正在尝试打开");
    }
  });
});

describe("driveCopyTip：复制后确实会唤起客户端时", () => {
  it("夸克/迅雷明说会去打开，且说清打开后做什么", () => {
    const quark = driveCopyTip("夸克网盘", { client: "launch" });
    expect(quark.advice).toContain("正在尝试打开");
    expect(quark.advice).toContain("剪贴板");
    expect(quark.tipImage).toBe("/tips/quark.png");

    const xunlei = driveCopyTip("迅雷网盘", { client: "launch" });
    expect(xunlei.advice).toContain("正在尝试打开");
    expect(xunlei.advice).toContain("粘贴");
    expect(xunlei.tipImage).toBe("/tips/xunlei.png");
  });

  it("没有客户端的平台不许说「正在尝试打开」—— 唤起不会发生，说了就是白等", () => {
    const tip = driveCopyTip("百度网盘", { client: "launch" });
    expect(tip.advice).not.toContain("正在尝试打开");
    expect(tip.advice).toContain("百度网盘");
  });

  it("说明用「尝试」而不是「正在打开」：浏览器拿不到协议唤起的回执", () => {
    expect(driveCopyTip("夸克网盘", { client: "launch" }).advice).toContain("尝试");
  });

  it("网页端会限速的提醒在唤起口径下同样保留", () => {
    expect(driveCopyTip("夸克网盘", { client: "launch" }).warning).toBe(DRIVE_WEB_WARNING);
  });
});

describe("driveCopyTip：这个网盘本会话已唤起过，这次只复制不唤起", () => {
  it("不再声称「正在尝试打开」—— 这次根本没去唤起，说了用户会白等", () => {
    for (const platform of ["夸克网盘", "迅雷网盘"]) {
      const tip = driveCopyTip(platform, { client: "already-open" });
      expect(tip.advice).not.toContain("正在尝试打开");
      expect(tip.advice).not.toContain("打开客户端");
      expect(tip.advice).toContain("已经打开过");
      expect(tip.advice).toContain(platform);
    }
  });

  it("不出现「刚才」—— 去重按网盘，上一次唤起可能是好几个 mod 之前", () => {
    for (const platform of ["夸克网盘", "迅雷网盘"]) {
      expect(driveCopyTip(platform, { client: "already-open" }).advice).not.toContain("刚才");
    }
  });

  it("教程图照旧给 —— 要粘贴还是在那个客户端里粘贴", () => {
    expect(driveCopyTip("夸克网盘", { client: "already-open" }).tipImage).toBe("/tips/quark.png");
    expect(driveCopyTip("迅雷网盘", { client: "already-open" }).tipImage).toBe("/tips/xunlei.png");
  });

  it("没有客户端的平台不会出现「已经打开过」—— 它压根没被唤起过，那是假话", () => {
    const tip = driveCopyTip("百度网盘", { client: "already-open" });
    expect(tip.advice).not.toContain("已经打开过");
    expect(tip.advice).not.toContain("正在尝试打开");
  });
});

describe("driveMobileTip：手机端复制链接后打开分享页", () => {
  it("复制成功且已打开分享页：说明会跳到 App，并提醒先转存", () => {
    const tip = driveMobileTip("夸克网盘", { copied: true, opened: true });
    expect(tip.advice).toContain("已复制");
    expect(tip.advice).toContain("分享页");
    expect(tip.advice).toContain("App");
    expect(tip.warning).toBe(DRIVE_MOBILE_TRANSFER_HINT);
    expect(tip.warning).toContain("转存");
    expect(tip.warning).toContain("自己的网盘");
  });

  it("复制失败就不许说「已复制」—— 页面还是照样打开的，如实说", () => {
    const tip = driveMobileTip("迅雷网盘", { copied: false, opened: true });
    expect(tip.advice).not.toContain("已复制");
    expect(tip.advice).toContain("复制失败");
    expect(tip.advice).toContain("分享页");
    expect(tip.warning).toBe(DRIVE_MOBILE_TRANSFER_HINT);
  });

  it("脏链接打不开分享页：让用户自己打开 App 粘贴，且不许说「正在打开」", () => {
    const tip = driveMobileTip("夸克网盘", { copied: true, opened: false });
    expect(tip.advice).toContain("已复制");
    expect(tip.advice).toContain("夸克 App");
    expect(tip.advice).toContain("粘贴");
    expect(tip.advice).not.toContain("正在打开");
    expect(tip.warning).toBe(DRIVE_MOBILE_TRANSFER_HINT);
  });

  it("手机上不塞桌面客户端教程图（public/tips/ 是 PC 截图，照着做不了）", () => {
    for (const platform of ["夸克网盘", "迅雷网盘", "百度网盘"]) {
      for (const copied of [true, false]) {
        for (const opened of [true, false]) {
          expect(driveMobileTip(platform, { copied, opened }).tipImage).toBeNull();
        }
      }
    }
  });

  it("不沿用桌面口径的「唤起客户端 / 剪贴板弹框」说法", () => {
    const tip = driveMobileTip("夸克网盘", { copied: true, opened: true });
    expect(tip.advice).not.toContain("正在尝试打开");
    expect(tip.advice).not.toContain("剪贴板");
    expect(tip.warning).not.toBe(DRIVE_WEB_WARNING);
  });

  it("其它网盘同样给转存提示（百度网盘这类没有桌面客户端也照常说）", () => {
    const tip = driveMobileTip("百度网盘", { copied: true, opened: true });
    expect(tip.advice).toContain("已复制");
    expect(tip.warning).toBe(DRIVE_MOBILE_TRANSFER_HINT);
  });
});
