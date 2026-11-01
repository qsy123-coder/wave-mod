import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AUTO_OPEN_MODS_STORAGE_KEY,
  AUTO_SKIP_NOTICE_KEY,
  buildAutoOpenModsScript,
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


describe("buildAutoOpenModsScript：输入网址进站时的直达（只在硬加载生效）", () => {
  function runScript({
    stored = "1",
    pathname = "/",
    readyState = "loading",
    throwOnRead = false,
  }: {
    stored?: string | null;
    pathname?: string;
    readyState?: string;
    throwOnRead?: boolean;
  } = {}) {
    const replaced: string[] = [];
    const sessionWrites: Array<[string, string]> = [];
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => {
          if (throwOnRead) throw new Error("storage blocked");
          return key === AUTO_OPEN_MODS_STORAGE_KEY ? stored : null;
        },
      },
      sessionStorage: {
        setItem: (key: string, value: string) => sessionWrites.push([key, value]),
      },
    };
    const fakeDocument = { readyState };
    const fakeLocation = { pathname, replace: (url: string) => replaced.push(url) };

    new Function("window", "document", "location", buildAutoOpenModsScript())(
      fakeWindow,
      fakeDocument,
      fakeLocation,
    );
    return { replaced, sessionWrites };
  }

  it("开启 + 硬加载首页 → 首屏前换到 /mods，并留下说明条标记", () => {
    const { replaced, sessionWrites } = runScript();
    expect(replaced).toEqual(["/mods"]);
    expect(sessionWrites).toEqual([[AUTO_SKIP_NOTICE_KEY, "1"]]);
  });

  it("站内客户端导航（readyState 不是 loading）→ 不跳，交给拦截弹窗", () => {
    expect(runScript({ readyState: "complete" }).replaced).toEqual([]);
  });

  it("偏好关闭时不动首页", () => {
    expect(runScript({ stored: "0" }).replaced).toEqual([]);
    expect(runScript({ stored: null }).replaced).toEqual([]);
  });

  it("只在路径恰好是 / 时生效", () => {
    expect(runScript({ pathname: "/mods" }).replaced).toEqual([]);
    expect(runScript({ pathname: "/guide" }).replaced).toEqual([]);
  });

  it("存储抛错（隐私模式）时静默放行", () => {
    expect(() => runScript({ throwOnRead: true })).not.toThrow();
    expect(runScript({ throwOnRead: true }).replaced).toEqual([]);
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
