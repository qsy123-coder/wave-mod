import { describe, expect, it } from "vitest";

import { buildDriveClientUrl, driveClientKind } from "./drive-client";

describe("driveClientKind", () => {
  it("夸克与迅雷都认，中英文都认（库里的 platform 是自由文本，有「夸克」也有「夸克网盘」）", () => {
    expect(driveClientKind("夸克")).toBe("quark");
    expect(driveClientKind("夸克网盘")).toBe("quark");
    expect(driveClientKind("Quark")).toBe("quark");
    expect(driveClientKind("迅雷")).toBe("xunlei");
    expect(driveClientKind("迅雷网盘")).toBe("xunlei");
    expect(driveClientKind("Xunlei")).toBe("xunlei");
  });

  it("没有桌面客户端的平台返回 null —— 编个不存在的协议只会让浏览器弹「找不到应用」", () => {
    for (const platform of ["百度网盘", "阿里云盘", "蓝奏云", "123网盘", ""]) {
      expect(driveClientKind(platform)).toBeNull();
    }
  });
});

describe("buildDriveClientUrl", () => {
  const QUARK_SHARE = "https://pan.quark.cn/s/abc123";
  const XUNLEI_SHARE = "https://pan.xunlei.com/s/xyz789";

  it("夸克：协议名是 qklink（不是 quark），且只带 host+path、不带 https://", () => {
    expect(buildDriveClientUrl("夸克网盘", QUARK_SHARE)).toBe("qklink://pan.quark.cn/s/abc123");
  });

  it("回归：夸克深链里不许再嵌一层 http(s):// —— 浏览器会把内层 scheme 当空端口，冒号被吃掉", () => {
    // new URL("qklink://https://pan.quark.cn/s/x").href
    //   === "qklink://https//pan.quark.cn/s/x"   ← 冒号没了
    // 夸克客户端把 qklink:// 换成 https://，于是变成 https://https//pan.quark.cn/s/x 的死链。
    // 真机上踩过一次（2026-09-28），这里钉死。
    for (const platform of ["夸克", "夸克网盘", "Quark"]) {
      const built = buildDriveClientUrl(platform, QUARK_SHARE);
      expect(built).not.toMatch(/qklink:\/\/https?:/i);
      expect(built).not.toContain("https//");
      expect(built).not.toContain("http//");
    }
  });

  it("迅雷：AA…ZZ 包裹后 base64，且能解回原链接", () => {
    const built = buildDriveClientUrl("迅雷", XUNLEI_SHARE);
    expect(built?.startsWith("thunder://")).toBe(true);

    const payload = Buffer.from(built!.slice("thunder://".length), "base64").toString("utf8");
    expect(payload).toBe(`AA${XUNLEI_SHARE}ZZ`);
  });

  it("没有客户端的平台返回 null，由调用方据此决定不唤起、也不改文案", () => {
    expect(buildDriveClientUrl("百度网盘", "https://pan.baidu.com/s/1abc")).toBeNull();
  });

  it("链接不像链接就返回 null（空串、非 http(s)、伪协议）", () => {
    expect(buildDriveClientUrl("夸克", "")).toBeNull();
    expect(buildDriveClientUrl("夸克", "   ")).toBeNull();
    expect(buildDriveClientUrl("夸克", "pan.quark.cn/s/abc")).toBeNull();
    expect(buildDriveClientUrl("夸克", "javascript:alert(1)")).toBeNull();
    expect(buildDriveClientUrl("迅雷", "ftp://example.com/x")).toBeNull();
  });

  it("链接两侧的空白先去掉再拼（drive_links 的值是后台人手填的）", () => {
    expect(buildDriveClientUrl("夸克", `  ${QUARK_SHARE}  `)).toBe("qklink://pan.quark.cn/s/abc123");
    expect(buildDriveClientUrl("迅雷", `  ${XUNLEI_SHARE}  `)).toBe(buildDriveClientUrl("迅雷", XUNLEI_SHARE));
  });

  it("链接含非 Latin1 字符时不能抛（btoa 遇到中文会直接抛 InvalidCharacterError）", () => {
    expect(() => buildDriveClientUrl("迅雷", "https://pan.xunlei.com/s/中文")).not.toThrow();
  });
});
