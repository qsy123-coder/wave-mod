import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getServerSupabaseEnv, isAdminIdentity } from "@/lib/supabase/server-config";

function isAllowedAdmin(identity: { email?: string | null; phone?: string | null } | null) {
  return isAdminIdentity(identity);
}

/** `/visits` 及其子路径（`/visits/unlock`）都不走管理员登录校验 */
function isVisitsPath(pathname: string) {
  return pathname === "/visits" || pathname.startsWith("/visits/");
}

/**
 * 让 `/visits` 的响应**一定带 `Set-Cookie`**，从而不会被香港 nginx 的共享缓存存下来。
 *
 * 为什么需要这么绕：
 *   - `/visits` 是按凭证渲染的动态页（带 `wavemod-visits` cookie 才 200，否则 404）；
 *   - 香港反代的 `location /` 有 600 秒 HTML 缓存，且 `proxy_ignore_headers Cache-Control`
 *     会无视 Next 发的 `private, no-store`；
 *   - 它的 bypass 只认 Supabase 登录态 cookie（`sb-*-auth-token`），`wavemod-visits` 不在其中；
 *   - 但 `proxy_no_cache` 里有 `$upstream_http_set_cookie` —— **上游回了 Set-Cookie 就不落盘**。
 *
 * 2026-10-30 实测：站长解锁后匿名打 `/visits` 拿到 `X-Cache-Status: HIT` + 完整统计表，
 * 就是这个原因。这里补一个 `Max-Age=0` 的空 cookie 当信号：浏览器收到即丢弃（不留痕），
 * nginx 看到 Set-Cookie 就不缓存。
 *
 * 根本解法仍是把 `visits` 加进 nginx 的不缓存 location（见
 * `deploy/hk-proxy/nginx/wavemod-proxy.conf.template`），两条一起才稳。
 */
function visitsNoCacheResponse() {
  const response = NextResponse.next();

  response.cookies.set({
    name: "wavemod-visits-nocache",
    value: "",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/visits",
  });

  return response;
}

export async function proxy(request: NextRequest) {
  // 统计页有自己的密钥凭证（`VISITS_TOKEN` + 签名 cookie），与 Supabase 登录无关，
  // 必须在这里短路，否则会被下面那段管理员校验弹去登录页。
  if (isVisitsPath(request.nextUrl.pathname)) {
    return visitsNoCacheResponse();
  }

  const env = getServerSupabaseEnv();

  if (!env) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    loginUrl.searchParams.set("mode", "admin");
    loginUrl.searchParams.set("error", "missing_env");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedAdmin(user)) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    loginUrl.searchParams.set("mode", "admin");
    loginUrl.searchParams.set("error", user ? "unauthorized" : "login_required");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/visits/:path*"],
};
