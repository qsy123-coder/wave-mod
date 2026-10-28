import { NextRequest, NextResponse } from "next/server";

import {
  NOCOUNT_COOKIE,
  VISITS_COOKIE,
  VISITS_COOKIE_MAX_AGE_SEC,
  secretEquals,
  signVisitsCookie,
} from "@/lib/visits/cookie";

/**
 * 密钥入口：`/visits?key=<token>` 会转到这里。
 *
 * 为什么单独一个 Route Handler：Server Component 里不能写 cookie，
 * 而「校验通过后发凭证」正是写 cookie 的动作。
 *
 * 校验失败一律 **404**，不给 401/403，也不说「密钥错误」——
 * 这个页面不该让任何人知道它存在。
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = process.env.VISITS_TOKEN?.trim();
  if (!token) return new NextResponse("Not Found", { status: 404 });

  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!secretEquals(key, token)) return new NextResponse("Not Found", { status: 404 });

  // 用**相对** Location，不拼绝对地址。
  // 香港 nginx 在前面、Vercel 在中间，函数拿到的 Host 已经被改写成
  // `wave-mod.vercel.app` —— 照着它跳，浏览器会离开用户访问的域名，
  // 而 httpOnly cookie 是挂在原域名上的，跳过去等于立刻失效（2026-10-28 实测踩到）。
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/visits", "Cache-Control": "no-store" },
  });
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set({
    name: VISITS_COOKIE,
    value: signVisitsCookie(token, Math.floor(Date.now() / 1000)),
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/visits",
    maxAge: VISITS_COOKIE_MAX_AGE_SEC,
  });

  // 站长设备不再计入站点统计：打开统计页本身就是「我是站长」的信号
  response.cookies.set({
    name: NOCOUNT_COOKIE,
    value: "1",
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: VISITS_COOKIE_MAX_AGE_SEC,
  });

  return response;
}
