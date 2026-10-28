import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { VISITS_COOKIE_MAX_AGE_SEC } from "./constants";

export { NOCOUNT_COOKIE, VISITS_COOKIE, VISITS_COOKIE_MAX_AGE_SEC } from "./constants";

/**
 * `/visits` 的访问凭证。
 *
 * 为什么不用 `/admin` 的 Supabase 登录：2026-10 起 Supabase Auth 被免费出口额度
 * 锁成 402，登录根本走不通。访问统计又恰好是「额度被打穿时最需要看」的东西，
 * 所以它必须有一条**完全不依赖 Supabase** 的入口。
 *
 * 代价是这里要自己保证两件事：
 *   1. 密钥只存在于服务器 `.env`，不出现在任何客户端代码里；
 *   2. 比对使用恒定时间比较，避免按响应时间逐字符试出密钥。
 *
 * cookie 里带签发时间，换密钥即全部作废（签名用的是新密钥）。
 */

const COOKIE_VERSION = "v1";
/** 容忍一分钟的时钟漂移，超过就是伪造/异常时钟 */
const FUTURE_TOLERANCE_SEC = 60;

/**
 * 恒定时间字符串比较。
 *
 * 先各自 sha256 再比：`timingSafeEqual` 要求两段 buffer 等长，直接比原始字符串
 * 会先暴露长度差，等于把「密钥多长」也漏出去。
 */
export function secretEquals(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;

  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();

  return timingSafeEqual(a, b);
}

function sign(token: string, payload: string): string {
  return createHmac("sha256", token).update(`visits:${payload}`).digest("hex");
}

/** 形如 `v1.<签发秒>.<hmac>` */
export function signVisitsCookie(token: string, issuedAtSec: number): string {
  const payload = `${COOKIE_VERSION}.${Math.trunc(issuedAtSec)}`;
  return `${payload}.${sign(token, payload)}`;
}

/**
 * 用「当前时间」校验的便捷封装。
 *
 * 页面里不要直接写 `Date.now()`：React 的 purity 规则会把它当成渲染期的不纯调用拦下来。
 * 把取时间这件事收进纯工具模块，页面只表达「拿 cookie 来验一下」。
 */
export function verifyVisitsCookieNow(
  token: string | null | undefined,
  value: string | null | undefined,
): boolean {
  return verifyVisitsCookie(token, value, Math.floor(Date.now() / 1000));
}

export function verifyVisitsCookie(
  token: string | null | undefined,
  value: string | null | undefined,
  nowSec: number,
): boolean {
  if (!token || !value) return false;

  const parts = value.split(".");
  if (parts.length !== 3) return false;

  const [version, issuedRaw, signature] = parts;
  if (version !== COOKIE_VERSION) return false;

  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

  if (nowSec - issuedAt > VISITS_COOKIE_MAX_AGE_SEC) return false;
  if (issuedAt - nowSec > FUTURE_TOLERANCE_SEC) return false;

  return secretEquals(signature, sign(token, `${version}.${issuedAt}`));
}
