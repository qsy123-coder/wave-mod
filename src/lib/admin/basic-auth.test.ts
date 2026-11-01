import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAdminBasicAuthConfig, verifyAdminBasicAuth } from "./basic-auth";

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

describe("verifyAdminBasicAuth", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "waveadmin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "s3cr3t-pass");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("接受正确凭据", async () => {
    await expect(verifyAdminBasicAuth(basic("waveadmin", "s3cr3t-pass"))).resolves.toBe(true);
  });

  it("拒绝错误密码", async () => {
    await expect(verifyAdminBasicAuth(basic("waveadmin", "wrong"))).resolves.toBe(false);
  });

  it("拒绝错误用户名", async () => {
    await expect(verifyAdminBasicAuth(basic("someone", "s3cr3t-pass"))).resolves.toBe(false);
  });

  it("拒绝缺失的 Authorization", async () => {
    await expect(verifyAdminBasicAuth(null)).resolves.toBe(false);
    await expect(verifyAdminBasicAuth("")).resolves.toBe(false);
  });

  it("拒绝非 Basic 方案", async () => {
    await expect(verifyAdminBasicAuth("Bearer abc.def.ghi")).resolves.toBe(false);
    await expect(verifyAdminBasicAuth("Basic")).resolves.toBe(false);
  });

  it("支持密码里包含冒号", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "a:b:c");
    await expect(verifyAdminBasicAuth(basic("waveadmin", "a:b:c"))).resolves.toBe(true);
  });

  it("支持非 ASCII 密码（按 UTF-8 解码）", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "密码-混排");
    await expect(verifyAdminBasicAuth(basic("waveadmin", "密码-混排"))).resolves.toBe(true);
  });

  it("env 缺失时失败关闭（除非显式放开）", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    expect(getAdminBasicAuthConfig()).toBeNull();
    await expect(verifyAdminBasicAuth(basic("waveadmin", ""))).resolves.toBe(false);
  });
});
