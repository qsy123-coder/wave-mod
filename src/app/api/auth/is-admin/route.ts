import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/supabase/server";

/**
 * 「当前请求者是不是管理员」——**只回一个布尔值**。
 *
 * 为什么要绕一个接口：判定要比较 `ADMIN_EMAIL` / `ADMIN_PHONES`，而
 * `server-config.ts` 是 `server-only` —— 这两个变量绝不能进前端包。
 * 于是把判定留在服务端，前端只知道「是不是」，永远拿不到「凭什么是」。
 * 响应体刻意只有 `isAdmin` 一个字段，不带头像/邮箱/手机号。
 *
 * 缓存头**必须**是 `private, no-store`，且**绝不能出现 `s-maxage`**：
 * 这个响应取决于请求方携带的认证 cookie，一旦被共享缓存（CDN / 反向代理）
 * 存下来，一个管理员的 `true` 就会被发给所有人。这条由 route.test.ts 锁住。
 *
 * 匿名请求也会得到 `false`，但前端只在登录后才调它（见 isAdminLookupNeeded）。
 *
 * 安全边界没变：`/admin/*` 的准入仍由 `proxy.ts` 与 `admin/layout.tsx` 的服务端
 * 守卫把关，这个接口只决定**渲染哪些入口链接**。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await isAdminUser();

  return NextResponse.json(
    { isAdmin },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
