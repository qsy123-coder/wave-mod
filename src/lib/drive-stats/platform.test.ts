import { describe, expect, it } from "vitest";

import { DRIVE_PLATFORM_MAX_LENGTH, normalizeDrivePlatform } from "./platform";

describe("normalizeDrivePlatform", () => {
  it("把同一个盘的常见写法归到同一个桶", () => {
    expect(normalizeDrivePlatform("夸克")).toBe("夸克");
    expect(normalizeDrivePlatform("夸克网盘")).toBe("夸克");
    expect(normalizeDrivePlatform("Quark")).toBe("夸克");
    expect(normalizeDrivePlatform("quark drive")).toBe("夸克");

    expect(normalizeDrivePlatform("迅雷")).toBe("迅雷");
    expect(normalizeDrivePlatform("迅雷网盘")).toBe("迅雷");
    expect(normalizeDrivePlatform("Xunlei")).toBe("迅雷");
  });

  it("覆盖其余已支持的网盘", () => {
    expect(normalizeDrivePlatform("百度网盘")).toBe("百度网盘");
    expect(normalizeDrivePlatform("baidu")).toBe("百度网盘");
    expect(normalizeDrivePlatform("阿里云盘")).toBe("阿里云盘");
    expect(normalizeDrivePlatform("aliyun")).toBe("阿里云盘");
    expect(normalizeDrivePlatform("蓝奏云")).toBe("蓝奏云");
    expect(normalizeDrivePlatform("lanzou")).toBe("蓝奏云");
    expect(normalizeDrivePlatform("天翼云盘")).toBe("天翼云盘");
    expect(normalizeDrivePlatform("ctyun")).toBe("天翼云盘");
    expect(normalizeDrivePlatform("115")).toBe("115");
    expect(normalizeDrivePlatform("一二网盘")).toBe("115");
    expect(normalizeDrivePlatform("和彩云")).toBe("移动云盘");
    expect(normalizeDrivePlatform("移动云")).toBe("移动云盘");
    expect(normalizeDrivePlatform("123云盘")).toBe("123云盘");
    expect(normalizeDrivePlatform("咪咕")).toBe("123云盘");
  });

  it("认不出的平台保留原名，只去掉结尾的「网盘」", () => {
    expect(normalizeDrivePlatform("某某盘网盘")).toBe("某某盘");
    expect(normalizeDrivePlatform("  Some Drive  ")).toBe("Some Drive");
  });

  it("空值与纯空白返回空串（调用方据此跳过）", () => {
    expect(normalizeDrivePlatform("")).toBe("");
    expect(normalizeDrivePlatform("   ")).toBe("");
    expect(normalizeDrivePlatform(null)).toBe("");
    expect(normalizeDrivePlatform(undefined)).toBe("");
  });

  it("过长的未知平台名被截断，避免脏数据把状态文件撑大", () => {
    const name = "超".repeat(DRIVE_PLATFORM_MAX_LENGTH + 10);
    expect(normalizeDrivePlatform(name)).toHaveLength(DRIVE_PLATFORM_MAX_LENGTH);
  });
});
