import { describe, expect, it } from "vitest";

import { parseGachaLink } from "./parse-link";

const BASE = "https://aki-gm-resources.aki-game.com/aki/gacha/index.html";

describe("parseGachaLink", () => {
  it("解析参数在顶层 query 的 PC 链接", () => {
    const result = parseGachaLink(
      `${BASE}?svr_id=svr-1&player_id=106485288&lang=zh-Hans&gacha_type=1&svr_area=cn&record_id=acdf99a1891e329555d37279a48f68ba&resources_id=c9fbcd24b02d54c175875b81513cfacc`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      playerId: "106485288",
      recordId: "acdf99a1891e329555d37279a48f68ba",
      resourcesId: "c9fbcd24b02d54c175875b81513cfacc",
      serverId: "svr-1",
      lang: "zh-Hans",
      region: "cn",
    });
  });

  it("解析参数在 #/record? 后面的链接", () => {
    const result = parseGachaLink(
      `${BASE}#/record?player_id=123456789&record_id=abcdef0123456789abcdef0123456789&resources_id=pool-id&svr_id=svr-2`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.playerId).toBe("123456789");
    expect(result.value.recordId).toBe("abcdef0123456789abcdef0123456789");
  });

  it("顶层与 hash 同时存在时 hash 优先", () => {
    const result = parseGachaLink(
      `${BASE}?player_id=old&record_id=11111111111111111111111111111111#/record?player_id=106485288&record_id=abcdef0123456789abcdef0123456789`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.playerId).toBe("106485288");
    expect(result.value.recordId).toBe("abcdef0123456789abcdef0123456789");
  });

  it("对百分号编码的参数做解码", () => {
    const result = parseGachaLink(
      `${BASE}#/record?player_id=123456789&record_id=0123456789abcdef0123456789abc%64%65%66&lang=zh%2DHans`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordId).toBe("0123456789abcdef0123456789abcdef");
    expect(result.value.lang).toBe("zh-Hans");
  });

  it("也接受直接粘贴的 query 串", () => {
    const result = parseGachaLink(
      "player_id=123456789&record_id=0123456789abcdef0123456789abcdef",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.playerId).toBe("123456789");
  });

  it("缺参数时返回可读错误", () => {
    const result = parseGachaLink(`${BASE}#/record?player_id=123`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("record_id");
  });

  it("player_id 不是数字时拒绝", () => {
    const result = parseGachaLink(
      `${BASE}?player_id=abc&record_id=0123456789abcdef0123456789abcdef`,
    );

    expect(result.ok).toBe(false);
  });

  it("record_id 不是十六进制串时拒绝", () => {
    const result = parseGachaLink(`${BASE}?player_id=123456789&record_id=not-a-token`);

    expect(result.ok).toBe(false);
  });

  it("非 1 开头的 UID 走国际服", () => {
    const result = parseGachaLink(
      `${BASE}?player_id=900123456&record_id=0123456789abcdef0123456789abcdef`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.region).toBe("global");
  });

  it("空输入给出明确提示", () => {
    const result = parseGachaLink("   ");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("粘贴");
  });
});
