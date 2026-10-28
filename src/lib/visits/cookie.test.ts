import { describe, expect, it } from "vitest";

import { VISITS_COOKIE_MAX_AGE_SEC, secretEquals, signVisitsCookie, verifyVisitsCookie } from "./cookie";

const TOKEN = "test-token-0123456789abcdef";
const NOW = 1_760_000_000;

describe("secretEquals", () => {
  it("相等才放行", () => {
    expect(secretEquals(TOKEN, TOKEN)).toBe(true);
  });

  it("差一个字符、长短不一、空值都不放行", () => {
    expect(secretEquals(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(secretEquals(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(secretEquals("", TOKEN)).toBe(false);
    expect(secretEquals(null, TOKEN)).toBe(false);
    expect(secretEquals(TOKEN, "")).toBe(false);
  });
});

describe("verifyVisitsCookie", () => {
  it("自己签的自己认", () => {
    expect(verifyVisitsCookie(TOKEN, signVisitsCookie(TOKEN, NOW), NOW + 60)).toBe(true);
  });

  it("换密钥后旧 cookie 立即失效", () => {
    const value = signVisitsCookie(TOKEN, NOW);
    expect(verifyVisitsCookie("another-token-0123456789", value, NOW + 60)).toBe(false);
  });

  it("过期就失效（30 天为界）", () => {
    const value = signVisitsCookie(TOKEN, NOW);
    expect(verifyVisitsCookie(TOKEN, value, NOW + VISITS_COOKIE_MAX_AGE_SEC - 1)).toBe(true);
    expect(verifyVisitsCookie(TOKEN, value, NOW + VISITS_COOKIE_MAX_AGE_SEC + 1)).toBe(false);
  });

  it("拒绝未来时间戳（容忍一分钟时钟漂移）", () => {
    const value = signVisitsCookie(TOKEN, NOW + 30);
    expect(verifyVisitsCookie(TOKEN, value, NOW)).toBe(true);
    expect(verifyVisitsCookie(TOKEN, signVisitsCookie(TOKEN, NOW + 120), NOW)).toBe(false);
  });

  it("改签发时间不会跟着变签名 —— 篡改被识破", () => {
    const value = signVisitsCookie(TOKEN, NOW);
    const [version, , signature] = value.split(".");

    expect(verifyVisitsCookie(TOKEN, `${version}.${NOW + 1000}.${signature}`, NOW + 1000)).toBe(false);
  });

  it("形状不对的一律拒绝", () => {
    expect(verifyVisitsCookie(TOKEN, undefined, NOW)).toBe(false);
    expect(verifyVisitsCookie(TOKEN, "", NOW)).toBe(false);
    expect(verifyVisitsCookie(TOKEN, "v1.abc", NOW)).toBe(false);
    expect(verifyVisitsCookie(TOKEN, "v2.1760000000.deadbeef", NOW)).toBe(false);
    expect(verifyVisitsCookie(undefined, signVisitsCookie(TOKEN, NOW), NOW)).toBe(false);
  });
});
