import { type NextRequest, NextResponse } from "next/server";

import { adminUnauthorizedResponse, verifyAdminBasicAuth } from "@/lib/admin/basic-auth";

/** `/visits` 及其子路径（`/visits/unlock`）都不走管理员校验 */
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
 * 后台入口守卫（Basic Auth）。
 *
 * 登录（Supabase Auth）已下线：后台不再有账号体系，改为 nginx + 应用层双层 Basic Auth。
 * 应用层这层不能省 —— 直连 `*.vercel.app` 不经过 nginx，只靠反代等于没锁。
 *
 * `/api/cos/sign`、`/api/oss/sign` 是后台专用签接口，同样必须走这里，
 * 否则拿到部署域名的人可以绕过 UI 直接申请上传凭证。
 */
export async function proxy(request: NextRequest) {
  if (isVisitsPath(request.nextUrl.pathname)) {
    return visitsNoCacheResponse();
  }

  const authorized = await verifyAdminBasicAuth(request.headers.get("authorization"));

  if (!authorized) {
    return adminUnauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/cos/sign", "/api/oss/sign", "/visits/:path*"],
};
