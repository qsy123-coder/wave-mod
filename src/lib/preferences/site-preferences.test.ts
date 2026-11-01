import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  consumeAutoSkipNotice,
  isImmersiveActive,
  isModsPathname,
  markAutoSkipNotice,
  parseStoredFlag,
} from "./site-preferences";

describe("parseStoredFlag：只认 \"1\"", () => {
  it("存储值为 \"1\" 时开启", () => {
    expect(parseStoredFlag("1")).toBe(true);
  });

  it("null / 空串 / 其它脏值一律视为关闭", () => {
    expect(parseStoredFlag(null)).toBe(false);
    expect(parseStoredFlag("")).toBe(false);
    expect(parseStoredFlag("0")).toBe(false);
    expect(parseStoredFlag("true")).toBe(false);
  });
});

describe("isModsPathname：角色分类页及其详情抽屉路由", () => {
  it("命中 /mods 与 /mods/<id>", () => {
    expect(isModsPathname("/mods")).toBe(true);
    expect(isModsPathname("/mods/abc123")).toBe(true);
  });

  it("不误伤 /mods-something 与其它页面", () => {
    expect(isModsPathname("/mods2")).toBe(false);
    expect(isModsPathname("/guide")).toBe(false);
    expect(isModsPathname("/")).toBe(false);
  });
});

describe("isImmersiveActive：沉浸 = 开关 + 桌面 + 在 /mods", () => {
  const base = { immersive: true, isDesktop: true, pathname: "/mods" };

  it("三个条件都满足才生效", () => {
    expect(isImmersiveActive(base)).toBe(true);
  });

  it("关掉开关不生效", () => {
    expect(isImmersiveActive({ ...base, immersive: false })).toBe(false);
  });

  it("手机宽度不生效（导航栏是手机上唯一入口）", () => {
    expect(isImmersiveActive({ ...base, isDesktop: false })).toBe(false);
  });

  it("离开 /mods 后不生效", () => {
    expect(isImmersiveActive({ ...base, pathname: "/guide" })).toBe(false);
    expect(isImmersiveActive({ ...base, pathname: "/" })).toBe(false);
  });
});


describe("直达分类跳过首页的提示标记", () => {
  const store = new Map<string, string>();
  type FakeWindow = {
    sessionStorage: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  };
  // 经 unknown 绕开 lib.dom 里完整的 Window 类型：这里只模拟用得到的那一个字段
  const globalWithWindow = globalThis as unknown as { window?: FakeWindow };

  beforeEach(() => {
    store.clear();
    // node 环境没有 window：造一个只带 sessionStorage 的最小实现
    globalWithWindow.window = {
      sessionStorage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    };
  });

  afterEach(() => {
    delete globalWithWindow.window;
  });

  it("打标记后只能取到一次（取走即清，刷新不会重复骚扰）", () => {
    markAutoSkipNotice();
    expect(consumeAutoSkipNotice()).toBe(true);
    expect(consumeAutoSkipNotice()).toBe(false);
  });

  it("没有标记时返回 false", () => {
    expect(consumeAutoSkipNotice()).toBe(false);
  });

  it("sessionStorage 抛错时不冒泡，按「没有提示」处理", () => {
    if (!globalWithWindow.window) throw new Error("window 未注入");
    globalWithWindow.window.sessionStorage.getItem = () => {
      throw new Error("blocked");
    };
    globalWithWindow.window.sessionStorage.setItem = () => {
      throw new Error("blocked");
    };
    expect(() => markAutoSkipNotice()).not.toThrow();
    expect(consumeAutoSkipNotice()).toBe(false);
  });
});
