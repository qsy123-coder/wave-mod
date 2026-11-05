import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe("admin session token", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "waveadmin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "s3cr3t-pass");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("签发后可以校验通过", async () => {
    const token = await createAdminSessionToken();
    expect(token).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
    await expect(verifyAdminSessionToken(token)).resolves.toBe(true);
  });

  it("默认有效期是 30 天", async () => {
    const token = await createAdminSessionToken();
    const expiresAt = Number(token?.split(".")[1]);
    const expected = nowSeconds() + ADMIN_SESSION_MAX_AGE_SECONDS;
    expect(Math.abs(expiresAt - expected)).toBeLessThanOrEqual(2);
  });

  it("拒绝空值、乱码和缺段", async () => {
    await expect(verifyAdminSessionToken(null)).resolves.toBe(false);
    await expect(verifyAdminSessionToken("")).resolves.toBe(false);
    await expect(verifyAdminSessionToken("hello")).resolves.toBe(false);
    await expect(verifyAdminSessionToken("v1.123")).resolves.toBe(false);
    await expect(verifyAdminSessionToken("v2.9999999999.abc")).resolves.toBe(false);
  });

  it("拒绝被篡改的到期时间", async () => {
    const token = await createAdminSessionToken();
    const [, signature] = String(token).split(".").slice(1);
    const forged = `v1.${nowSeconds() + 999999}.${signature}`;
    await expect(verifyAdminSessionToken(forged)).resolves.toBe(false);
  });

  it("拒绝被篡改的签名", async () => {
    const token = String(await createAdminSessionToken());
    const forged = `${token.slice(0, -2)}xx`;
    await expect(verifyAdminSessionToken(forged)).resolves.toBe(false);
  });

  it("拒绝已过期的 token", async () => {
    const token = await createAdminSessionToken(60);
    await expect(verifyAdminSessionToken(token, nowSeconds() + 61)).resolves.toBe(false);
    await expect(verifyAdminSessionToken(token, nowSeconds() + 30)).resolves.toBe(true);
  });

  it("缺少管理员凭据时失败关闭", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    await expect(createAdminSessionToken()).resolves.toBeNull();
    await expect(verifyAdminSessionToken("v1.9999999999.abc")).resolves.toBe(false);
  });

  it("改密码后旧 Cookie 立即失效", async () => {
    const token = await createAdminSessionToken();
    await expect(verifyAdminSessionToken(token)).resolves.toBe(true);

    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "another-pass");
    await expect(verifyAdminSessionToken(token)).resolves.toBe(false);
  });

  it("ADMIN_SESSION_SECRET 显式配置时优先使用", async () => {
    const token = await createAdminSessionToken();
    vi.stubEnv("ADMIN_SESSION_SECRET", "dedicated-secret");
    await expect(verifyAdminSessionToken(token)).resolves.toBe(false);

    const next = await createAdminSessionToken();
    await expect(verifyAdminSessionToken(next)).resolves.toBe(true);
  });
});
