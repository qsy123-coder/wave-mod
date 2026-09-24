/**
 * 入口巡检判定规则的单测。
 *
 * 为什么单独锁这个：巡检的失败模式是**静默的**，而且两个方向都糟 ——
 *
 * - 判定太松（把 402 判成 ok）⇒ 用户又在看「网站已经暂停部署」，我们却以为一切正常，
 *   等于白装了一个告警。
 * - 判定太紧（把正常的 404 判成 critical）⇒ 每天发一封假警报，几天后告警就被无视了，
 *   和没装一样。
 *
 * 所以下面既锁「必须报红」的情形，也锁「不许误报」的情形。
 */
import { describe, expect, it } from "vitest";

import { classifyProbe, worstSeverity } from "./endpoint-patrol.mjs";

describe("classifyProbe · Vercel 旧端点探测", () => {
  it("DEPLOYMENT_DISABLED = 残留用户又在看暂停页 → critical", () => {
    const v = classifyProbe({
      kind: "vercel-edge",
      status: 402,
      headers: { "x-vercel-error": "DEPLOYMENT_DISABLED", server: "Vercel" },
    });
    expect(v.severity).toBe("critical");
    expect(v.reason).toContain("DEPLOYMENT_DISABLED");
  });

  it("只凭 402 也判 critical（响应头可能变化）", () => {
    const v = classifyProbe({ kind: "vercel-edge", status: 402, headers: {} });
    expect(v.severity).toBe("critical");
  });

  it("307 跳到 go.sunnyrose.xyz = 兜底重定向在正常工作 → ok", () => {
    const v = classifyProbe({
      kind: "vercel-edge",
      status: 307,
      headers: { location: "https://go.sunnyrose.xyz/" },
    });
    expect(v.severity).toBe("ok");
  });

  it("308 同 307 处理（万一当初配了 permanent:true）", () => {
    const v = classifyProbe({
      kind: "vercel-edge",
      status: 308,
      headers: { location: "https://go.sunnyrose.xyz/mods" },
    });
    expect(v.severity).toBe("ok");
  });

  it("404（域名已不被 Vercel 认领）= 可接受的退化结果 → warn，不是 critical", () => {
    // 兜底项目被拆掉之后就是这个形状：残留用户看到普通 404，而不是那张吓人的暂停页。
    const v = classifyProbe({
      kind: "vercel-edge",
      status: 404,
      headers: { server: "Vercel" },
    });
    expect(v.severity).toBe("warn");
  });

  it("连不上（Vercel 换了 anycast IP）= 判不了，而非故障 → warn", () => {
    const v = classifyProbe({
      kind: "vercel-edge",
      status: null,
      headers: {},
      error: "ECONNRESET",
    });
    expect(v.severity).toBe("warn");
    expect(v.reason).toContain("ECONNRESET");
  });

  it("307 但跳去了别处 = 配置被改坏 → warn", () => {
    const v = classifyProbe({
      kind: "vercel-edge",
      status: 307,
      headers: { location: "https://example.com/" },
    });
    expect(v.severity).toBe("warn");
  });

  it("响应头大小写不敏感（Node 回调里 key 小写，人工核对时可能大写）", () => {
    const v = classifyProbe({
      kind: "vercel-edge",
      status: 402,
      headers: { "X-Vercel-Error": "DEPLOYMENT_DISABLED" },
    });
    expect(v.severity).toBe("critical");
  });
});

describe("classifyProbe · 站点自身探测", () => {
  it("200 → ok", () => {
    expect(classifyProbe({ kind: "site", status: 200, headers: {} }).severity).toBe("ok");
  });

  it("被 nginx 误 301 到 www.wave-mod.top = 新入口配错的那个坑 → critical", () => {
    // 实测首尔 nginx 对未知 Host 会回落到 apex 的 301 块跳 www。
    // 这个形状必须报红，否则新入口悄悄失效。
    const v = classifyProbe({
      kind: "site",
      status: 301,
      headers: { location: "https://www.wave-mod.top/" },
    });
    expect(v.severity).toBe("critical");
    expect(v.reason).toContain("www.wave-mod.top");
  });

  it("5xx → critical（站点挂了）", () => {
    expect(classifyProbe({ kind: "site", status: 502, headers: {} }).severity).toBe("critical");
  });

  it("3xx 到别处（例如 http→https 跳自己）→ warn，不误报 critical", () => {
    const v = classifyProbe({
      kind: "site",
      status: 301,
      headers: { location: "https://go.sunnyrose.xyz/" },
    });
    expect(v.severity).toBe("warn");
  });

  it("连不上 → critical（站点不可达）", () => {
    const v = classifyProbe({ kind: "site", status: null, headers: {}, error: "ETIMEDOUT" });
    expect(v.severity).toBe("critical");
  });
});

describe("classifyProbe · DNS 探测", () => {
  it("解析到首尔 IP → ok", () => {
    const v = classifyProbe({
      kind: "dns",
      status: null,
      headers: {},
      addresses: ["43.133.78.46"],
    });
    expect(v.severity).toBe("ok");
  });

  it("解析到 Vercel 的 IP = A 记录被改回去了 → critical", () => {
    const v = classifyProbe({
      kind: "dns",
      status: null,
      headers: {},
      addresses: ["76.76.21.21"],
    });
    expect(v.severity).toBe("critical");
  });

  it("解析到任何别的 IP（被劫持/改动）→ critical", () => {
    const v = classifyProbe({
      kind: "dns",
      status: null,
      headers: {},
      addresses: ["1.2.3.4"],
    });
    expect(v.severity).toBe("critical");
  });

  it("解析不出东西 → critical", () => {
    const v = classifyProbe({ kind: "dns", status: null, headers: {}, addresses: [] });
    expect(v.severity).toBe("critical");
  });
});

describe("worstSeverity", () => {
  it("全 ok 才是 ok", () => {
    expect(worstSeverity(["ok", "ok"])).toBe("ok");
  });

  it("有 warn 取 warn", () => {
    expect(worstSeverity(["ok", "warn", "ok"])).toBe("warn");
  });

  it("critical 压过一切", () => {
    expect(worstSeverity(["warn", "critical", "ok"])).toBe("critical");
  });

  it("空数组视为 ok", () => {
    expect(worstSeverity([])).toBe("ok");
  });
});
