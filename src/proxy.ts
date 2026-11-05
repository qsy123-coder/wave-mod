import { type NextRequest, NextResponse } from "next/server";

import { adminUnauthorizedResponse, verifyAdminBasicAuth } from "@/lib/admin/basic-auth";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin/session";

const ADMIN_LOGIN_PATH = "/admin/login";

/** `/visits` 及其子路径（`/visits/unlock`）都不走管理员校验 */
function isVisitsPath(pathname: string) {
  return pathname === "/visits" || pathname.startsWith("/visits/");
}

/** 登录页本身（含它的 Server Action POST）必须放行，否则永远登不进来 */
function isAdminLoginPath(pathname: string) {
  return pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`);
}

/**
 * 浏览器整页导航 / Next 客户端导航：这两类未授权时应该 302 到登录页，
 * 而不是甩一个 401 —— 401 在整页导航下只会显示空白错误页。
 */
function wantsPage(request: NextRequest) {
  if (request.method !== "GET") return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") || request.headers.get("rsc") === "1";
}

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  url.pathname = ADMIN_LOGIN_PATH;
  url.search = "";
  if (next.startsWith("/admin")) url.searchParams.set("next", next);

  return NextResponse.redirect(url);
}

/**
 * 让 `/visits` 的响应**一定带 `Set-Cookie`**，从而不会被香港 nginx 的共享缓存存下来。
 *
 * 为什么需要这么绕：
 *   - `/visits` 是按凭证渲染的动态页（带 `wavemod-visits` cookie 才 200，否则 404）；
 *   - 香港反代的 `location /` 有 600 秒 HTML 缓存，且 `proxy_ignore_headers Cache-Control`
 *     会无视 Next 发的 `private, no-store`；
 *   - 但 `proxy_no_cache` 里有 `$upstream_http_set_cookie` —— **上游回了 Set-Cookie 就不落盘**。
 *
 * 这里补一个 `Max-Age=0` 的空 cookie 当信号：浏览器收到即丢弃（不留痕），
 * nginx 看到 Set-Cookie 就不缓存。根本解法仍是把 `visits` 加进 nginx 的不缓存 location。
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

/**
 * 后台入口守卫。
 *
 * 登录（Supabase Auth）已下线，改为两层：
 *   1. 香港 nginx：Basic Auth 或 `wavemod_admin_session` Cookie 二选一（见 nginx 模板）；
 *   2. 应用层这里：Cookie 验签 或 Basic 头校验，二选一。
 *
 * 应用层这层不能省 —— 直连 `*.vercel.app` 不经过 nginx，只靠反代等于没锁。
 * `/api/cos/sign`、`/api/oss/sign` 是后台专用签接口，同样必须走这里，
 * 否则拿到部署域名的人可以绕过 UI 直接申请上传凭证。
 *
 * 关键：未授权时**不再发 `WWW-Authenticate`**，浏览器就不会弹原生 Basic 框；
 * 整页导航 302 到站内登录页，接口/Server Action 返回 401 JSON。
 */
export async function proxy(request: NextRequest) {
  if (isVisitsPath(request.nextUrl.pathname)) {
    return visitsNoCacheResponse();
  }

  if (isAdminLoginPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (await verifyAdminSessionToken(sessionToken)) {
    return NextResponse.next();
  }

  if (await verifyAdminBasicAuth(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return wantsPage(request) ? loginRedirect(request) : adminUnauthorizedResponse();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/cos/sign",
    "/api/oss/sign",
    "/visits/:path*",
  ],
};
