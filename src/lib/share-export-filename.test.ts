import { describe, expect, it } from "vitest";

import { buildZipFileName, sanitizeFileName } from "./share-export-filename";

describe("sanitizeFileName", () => {
  it("把 Windows 非法字符统一替换为下划线", () => {
    expect(sanitizeFileName("千咲/皮肤:测试")).toBe("千咲_皮肤_测试");
    expect(sanitizeFileName('a"b<c>d|e?f*g')).toBe("a_b_c_d_e_f_g");
  });

  it("去掉结尾的点与空格（Windows 会静默丢弃导致错位）", () => {
    expect(sanitizeFileName("name.  ")).toBe("name");
    expect(sanitizeFileName("  name  ")).toBe("name");
  });

  it("去掉控制字符", () => {
    expect(sanitizeFileName("a\u0000b")).toBe("ab");
  });

  it("空串 / 全空白回退为 mod", () => {
    expect(sanitizeFileName("")).toBe("mod");
    expect(sanitizeFileName("   ")).toBe("mod");
  });
});

describe("buildZipFileName", () => {
  it("日期键转成点分格式的 zip 文件名", () => {
    expect(buildZipFileName("2026-11-19")).toBe("每日更新-2026.11.19.zip");
  });
});
