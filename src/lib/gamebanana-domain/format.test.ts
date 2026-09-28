import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/gamebanana-domain/format";

describe("formatBytes", () => {
  it("三档单位", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB"); // 1.5 KB 四舍五入到整数 KB
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 12.34)).toBe("12.3 MB");
  });

  it("档位边界取上档（1024 不进 KB 而是 1 KB —— 不显示 1024 B）", () => {
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
  });

  it("拿不到或非正数 → null，交给调用方决定不显示这一项", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
