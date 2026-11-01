import { describe, expect, it } from "vitest";

import {
  BOOT_OVERLAY_ATTR,
  BOOT_OVERLAY_SESSION_KEY,
  BOOT_OVERLAY_SLOW_MS,
  BOOT_OVERLAY_STARTED_AT_ATTR,
  buildBootOverlayScript,
  shouldShowBootOverlay,
} from "./boot-overlay";

describe("shouldShowBootOverlay：只有「第一次」和「确实慢」才显示", () => {
  it("本次会话第一次访问 → 显示（哪怕很快）", () => {
    expect(shouldShowBootOverlay({ elapsedMs: 120, alreadySeen: false })).toBe(true);
  });

  it("已经见过且这次很快 → 不显示（避免每次导航都闪一下）", () => {
    expect(shouldShowBootOverlay({ elapsedMs: 120, alreadySeen: true })).toBe(false);
  });

  it("已经见过但这次变慢（例如首页缓存被清）→ 仍然显示", () => {
    expect(
      shouldShowBootOverlay({ elapsedMs: BOOT_OVERLAY_SLOW_MS, alreadySeen: true }),
    ).toBe(true);
    expect(shouldShowBootOverlay({ elapsedMs: 3000, alreadySeen: true })).toBe(true);
  });

  it("阈值可覆盖，且恰好等于阈值算「慢」", () => {
    expect(
      shouldShowBootOverlay({ elapsedMs: 499, alreadySeen: true, slowThresholdMs: 500 }),
    ).toBe(false);
    expect(
      shouldShowBootOverlay({ elapsedMs: 500, alreadySeen: true, slowThresholdMs: 500 }),
    ).toBe(true);
  });

  it("elapsed 不是有限数时，只按「是否第一次」判断", () => {
    expect(shouldShowBootOverlay({ elapsedMs: Number.NaN, alreadySeen: true })).toBe(false);
  });
});

describe("buildBootOverlayScript：首屏前同步执行的引导脚本", () => {
  function runScript({
    storedSeen = null as string | null,
    readyState = "loading",
    elapsed = 100,
    throwOnRead = false,
    throwOnWrite = false,
  } = {}) {
    const attrs: Record<string, string> = {};
    const written: Array<[string, string]> = [];
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
      sessionStorage: {
        getItem: (key: string) => {
          if (throwOnRead) throw new Error("storage blocked");
          return key === BOOT_OVERLAY_SESSION_KEY ? storedSeen : null;
        },
        setItem: (key: string, value: string) => {
          if (throwOnWrite) throw new Error("storage blocked");
          written.push([key, value]);
        },
      },
    };

    new Function("window", "document", buildBootOverlayScript())(fakeWindow, fakeDocument);
    return { attrs, written };
  }

  it("第一次访问：打开遮罩并记下出现时刻，同时写入会话标记", () => {
    const { attrs, written } = runScript({ storedSeen: null, elapsed: 432 });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("on");
    expect(attrs[BOOT_OVERLAY_STARTED_AT_ATTR]).toBe("432");
    expect(written).toEqual([[BOOT_OVERLAY_SESSION_KEY, "1"]]);
  });

  it("已经见过且这次很快：不显示遮罩", () => {
    const { attrs } = runScript({ storedSeen: "1", elapsed: 120 });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("off");
    expect(attrs[BOOT_OVERLAY_STARTED_AT_ATTR]).toBeUndefined();
  });

  it("已经见过但这次很慢（缓存被清）：仍然显示", () => {
    const { attrs } = runScript({ storedSeen: "1", elapsed: BOOT_OVERLAY_SLOW_MS + 1 });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("on");
  });

  it("站内客户端导航（readyState 不是 loading）完全不参与", () => {
    const { attrs } = runScript({ readyState: "complete", elapsed: 60_000 });
    expect(attrs).toEqual({});
  });

  it("sessionStorage 抛错（隐私模式）时按「第一次访问」处理，不冒泡异常", () => {
    expect(() => runScript({ throwOnRead: true })).not.toThrow();
    const { attrs } = runScript({ throwOnRead: true });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("on");
  });

  it("写入会话标记失败也不影响本次判定", () => {
    const { attrs } = runScript({ throwOnWrite: true });
    expect(attrs[BOOT_OVERLAY_ATTR]).toBe("on");
  });
});
