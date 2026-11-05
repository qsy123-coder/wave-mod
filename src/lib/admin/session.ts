import "server-only";

import { getAdminBasicAuthConfig } from "./basic-auth";

/**
 * 后台登录态（替代浏览器原生 Basic Auth 弹框）。
 *
 * 为什么不再用浏览器弹框：Chrome 只把 Basic 凭据放在内存里，关掉浏览器 / 隐私窗口 /
 * 隔天就重新弹一次，后台每天上传都要重输。这里改成登录页 + 30 天签名 Cookie：
 * 一次登录，之后 `proxy.ts` 只验 Cookie。
 *
 * 签名密钥优先用 `ADMIN_SESSION_SECRET`；没配就由 `ADMIN_BASIC_AUTH_USER/PASSWORD`
 * 派生 —— 改密码会让所有旧 Cookie 立即失效，也省得再往 Vercel 加一条 env。
 *
 * 值格式：`v1.<到期秒级时间戳>.<base64url(HMAC-SHA256(secret, "v1.<时间戳>")>)`
 * 校验走 `crypto.subtle.verify`（定长比较，不会按字符提前返回）。
 */

export const ADMIN_SESSION_COOKIE = "wavemod_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const TOKEN_VERSION = "v1";

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(normalized + padding);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const explicit = process.env.ADMIN_SESSION_SECRET?.trim();
  const config = getAdminBasicAuthConfig();
  const secret = explicit || (config ? `${config.user}\u0000${config.password}` : "");

  // 没配任何管理员凭据时失败关闭：签不出、也验不过
  if (!secret) return null;

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`wavemod-admin-session:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createAdminSessionToken(
  ttlSeconds: number = ADMIN_SESSION_MAX_AGE_SECONDS,
): Promise<string | null> {
  const key = await getSigningKey();
  if (!key) return null;

  // 最短 60 秒：避免调用方传 0/负数签出一个立刻过期的 token
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(
  token: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) return false;

  const signature = decodeBase64Url(parts[2]);
  if (!signature) return false;

  const key = await getSigningKey();
  if (!key) return false;

  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}
