import { describe, expect, it } from "vitest";

import { buildModShareUrl } from "./mod-share";

describe("buildModShareUrl", () => {
  it("用规范域名拼出详情页绝对地址", () => {
    expect(buildModShareUrl("https://go.sunnyrose.xyz", "mod-123")).toBe(
      "https://go.sunnyrose.xyz/mods/mod-123",
    );
  });

  // getSiteUrl() 的返回值由环境变量决定，末尾带不带斜杠都可能出现
  it("去掉域名末尾多余的斜杠", () => {
    expect(buildModShareUrl("https://go.sunnyrose.xyz///", "mod-123")).toBe(
      "https://go.sunnyrose.xyz/mods/mod-123",
    );
  });

  it("对 id 做 URL 编码", () => {
    expect(buildModShareUrl("https://go.sunnyrose.xyz", "a b/中文")).toBe(
      "https://go.sunnyrose.xyz/mods/a%20b%2F%E4%B8%AD%E6%96%87",
    );
  });

  // 分享链接必须干净：带 ?character= 之类的参数会把对方的筛选状态也带过去
  it("永远不带查询参数", () => {
    const url = buildModShareUrl("https://go.sunnyrose.xyz", "mod-123");
    expect(url).not.toContain("?");
    expect(url).not.toContain("#");
  });

  // mod.id 取的是库里的字面量，不假设它已经是编码态
  it("把百分号也当字面量编码", () => {
    expect(buildModShareUrl("https://go.sunnyrose.xyz", "a%20b")).toBe(
      "https://go.sunnyrose.xyz/mods/a%2520b",
    );
  });
});
