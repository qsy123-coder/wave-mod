import "server-only";

/**
 * 后台 Basic Auth 的应用层校验。
 *
 * 为什么 nginx 已经有一层还要再做：香港 nginx 只保护 `go.sunnyrose.xyz` 这个入口，
 * 知道 Vercel 部署域名的人可以直连 `*.vercel.app/admin` 绕过它。应用层必须能独立
 * 验证同一份凭据，才算真的挡住。
 *
 * 凭据只来自服务端 env，永不进客户端 bundle；比较前先各自做 SHA-256，
 * 再用定长比较，避免按字符提前返回带来的时序侧信道。
 */

function digest(value: string): Promise<Uint8Array> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then(
    (buffer) => new Uint8Array(buffer),
  );
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;

  for (let i = 0; i < digestA.length; i++) {
    diff |= digestA[i] ^ digestB[i];
  }

  return diff === 0;
}

function parseBasicHeader(header: string | null): { user: string; password: string } | null {
  if (!header) return null;

  const match = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  try {
    // atob 在 Edge / Node 两种运行时都可用；再按 UTF-8 解码，避免非 ASCII 密码被当成 Latin-1。
    const binary = atob(match[1]);
    const decoded = new TextDecoder().decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
    const separator = decoded.indexOf(":");

    if (separator < 0) return null;

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function getAdminBasicAuthConfig(): { user: string; password: string } | null {
  const user = process.env.ADMIN_BASIC_AUTH_USER?.trim();
  const password = process.env.ADMIN_BASIC_AUTH_PASSWORD;

  if (!user || !password) return null;

  return { user, password };
}

/** 校验用户名 + 密码（登录页与 Basic 头共用同一份判断） */
export async function verifyAdminCredentials(user: string, password: string): Promise<boolean> {
  const config = getAdminBasicAuthConfig();
  if (!config) return false;

  // 两个字段都要比较（不要用 && 短路），否则可以通过响应时间区分「用户名对、密码错」。
  const [userOk, passwordOk] = await Promise.all([
    safeEqual(user, config.user),
    safeEqual(password, config.password),
  ]);

  return userOk && passwordOk;
}

export async function verifyAdminBasicAuth(header: string | null): Promise<boolean> {
  const credentials = parseBasicHeader(header);
  if (!credentials) return false;

  return verifyAdminCredentials(credentials.user, credentials.password);
}

/**
 * 未授权响应。
 *
 * **刻意不发 `WWW-Authenticate`**：发了浏览器就会弹原生 Basic 登录框 —— 后台已经
 * 改成站内登录页 + 30 天 Cookie（见 `session.ts`），这里再弹框等于又回到「每次都输密码」。
 * curl 用 `-u` 预发凭据，不需要 challenge。
 */
export function adminUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
