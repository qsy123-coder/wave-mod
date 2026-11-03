import { describe, expect, it } from "vitest";

import {
  BOOT_OVERLAY_ATTR,
  BOOT_OVERLAY_SLOW_MS,
  BOOT_OVERLAY_STARTED_AT_ATTR,
  buildBootOverlayScript,
  shouldShowBootOverlay,
} from "./boot-overlay";

describe("shouldShowBootOverlay：只有「确实慢」才显示", () => {
  it("页面很快 → 不显示（哪怕是本次会话第一次访问）", () => {
    expect(shouldShowBootOverlay({ elapsedMs: 120 })).toBe(false);
  });

  it("达到阈值 → 显示（冷启动 / 缓存回源）", () => {
    expect(shouldShowBootOverlay({ elapsedMs: BOOT_OVERLAY_SLOW_MS })).toBe(true);
    expect(shouldShowBootOverlay({ elapsedMs: 3000 })).toBe(true);
  });

  it("阈值可覆盖，且恰好等于阈值算「慢」", () => {
    expect(shouldShowBootOverlay({ elapsedMs: 499, slowThresholdMs: 500 })).toBe(false);
    expect(shouldShowBootOverlay({ elapsedMs: 500, slowThresholdMs: 500 })).toBe(true);
  });

  it("elapsed 不是有限数 → 不显示", () => {
    expect(shouldShowBootOverlay({ elapsedMs: Number.NaN })).toBe(false);
  });
});

describe("buildBootOverlayScript：首屏前同步执行的引导脚本", () => {
  function runScript({ readyState = "loading", elapsed = 100 } = {}) {
    const attrs: Record<string, string> = {};
    const fakeDocument = {
      readyState,
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attrs[name] = value;
        },
      },
    };
    const fakeWindow = {
      performance: { now: () => elapsed },
      setTimeout: () => 0,
    };

    new Function("window", "document", buildBootOverlayScript())(fakeWindow, fakeDocument);
    return { attrs };
  }

  it("页面很快：不打开遮罩，也不留出现时刻", () => {
    const { attrs } = runScript({ elapsed: 120 });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("off");
    expect(attrs[BOOT_OVERLAY_STARTED_AT_ATTR]).toBeUndefined();
  });

  it("确实慢：打开遮罩并记下出现时刻", () => {
    const { attrs } = runScript({ elapsed: BOOT_OVERLAY_SLOW_MS + 1 });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("on");
    expect(attrs[BOOT_OVERLAY_STARTED_AT_ATTR]).toBe(String(BOOT_OVERLAY_SLOW_MS + 1));
  });

  it("站内客户端导航（readyState 不是 loading）完全不参与", () => {
    const { attrs } = runScript({ readyState: "complete", elapsed: 60_000 });
    expect(attrs).toEqual({});
  });
});
