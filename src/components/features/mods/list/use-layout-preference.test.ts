import { describe, expect, it } from "vitest";

import { resolvePreferredColumns } from "./use-layout-preference";

describe("resolvePreferredColumns：显式列数 → 当前档位校验 → 兜底值", () => {
  it("还没量到视口（SSR / 水合首帧）时直接采信显式列数 —— 手机首页必须从 HTML 起就是 2 列", () => {
    // 拿桌面档位（3–6）去校验 2 的话，SSR/流式直出的内容会铺成 5 列，水合后才跳回 2 列
    expect(resolvePreferredColumns(2, null, 5)).toBe(2);
  });

  it("量到宽度后仍要校验：桌面存下的 5 / 6 列不能铺到手机屏上", () => {
    expect(resolvePreferredColumns(6, 390, 2)).toBe(2);
    expect(resolvePreferredColumns(5, 390, 2)).toBe(2);
  });

  it("手机档位允许 2 / 3 列", () => {
    expect(resolvePreferredColumns(2, 390, 3)).toBe(2);
    expect(resolvePreferredColumns(3, 390, 2)).toBe(3);
  });

  it("桌面档位允许 3–6 列；2 列越档，退回自适应值", () => {
    expect(resolvePreferredColumns(4, 1440, 5)).toBe(4);
    expect(resolvePreferredColumns(6, 1440, 5)).toBe(6);
    expect(resolvePreferredColumns(2, 1440, 5)).toBe(5);
  });

  it("640px 是分界：639 走手机档位，640 走桌面档位", () => {
    expect(resolvePreferredColumns(3, 639, 2)).toBe(3);
    expect(resolvePreferredColumns(2, 640, 5)).toBe(5);
  });

  it("没有显式列数（用户没选过）时用兜底值", () => {
    expect(resolvePreferredColumns(null, null, 5)).toBe(5);
    expect(resolvePreferredColumns(undefined, 390, 2)).toBe(2);
  });
});
