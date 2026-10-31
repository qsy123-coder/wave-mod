import { describe, expect, it } from "vitest";

import {
  AUTO_OPEN_MODS_STORAGE_KEY,
  buildAutoOpenModsScript,
  isImmersiveActive,
  isModsPathname,
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

describe("buildAutoOpenModsScript：首页绘制前的直达脚本", () => {
  /** 在沙箱里执行脚本：window / location 作为参数注入，不碰真实 DOM */
  function runScript(
    stored: string | null,
    { pathname = "/", throwOnRead = false }: { pathname?: string; throwOnRead?: boolean } = {},
  ) {
    const replaced: string[] = [];
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => {
          if (throwOnRead) throw new Error("storage blocked");
          return key === AUTO_OPEN_MODS_STORAGE_KEY ? stored : null;
        },
      },
    };
    const fakeLocation = {
      pathname,
      replace: (url: string) => replaced.push(url),
    };

    new Function("window", "location", buildAutoOpenModsScript())(fakeWindow, fakeLocation);
    return replaced;
  }

  it("开启 + 访问首页时在绘制前替换到 /mods", () => {
    expect(runScript("1")).toEqual(["/mods"]);
  });

  it("关闭时完全不动首页", () => {
    expect(runScript("0")).toEqual([]);
    expect(runScript(null)).toEqual([]);
  });

  it("只在路径恰好是 / 时生效", () => {
    expect(runScript("1", { pathname: "/mods" })).toEqual([]);
    expect(runScript("1", { pathname: "/guide" })).toEqual([]);
  });

  it("localStorage 抛错（隐私模式）时静默放行，不冒泡异常", () => {
    expect(() => runScript("1", { throwOnRead: true })).not.toThrow();
    expect(runScript("1", { throwOnRead: true })).toEqual([]);
  });

  it("使用 location.replace 而不是产生历史记录的方式", () => {
    expect(buildAutoOpenModsScript()).toContain('location.replace("/mods")');
  });
});
