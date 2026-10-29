import { NextRequest, NextResponse } from "next/server";

import { recordVisit } from "@/lib/visits/store";
import { handleVisitPost } from "@/lib/visits/web-api";

/**
 * 站点访问打点入口。
 *
 * 为什么是 POST 而不是在页面渲染时计数：站点页面是静态渲染 + 香港 nginx 缓存的，
 * 服务端根本不会为每一次访问都执行一次渲染。只有浏览器发出来的请求才是「真的有人来了」。
 *
 * 响应**永远是 204**：打点是 fire-and-forget，请求体、设备号、机器人过滤任何一项
 * 不合法都只是「这次不计」，不该让页面看到一个错误。
 *
 * 校验在 `@/lib/visits/web-api`：香港边缘服务跑的是同一份。
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  const result = await handleVisitPost(
    recordVisit,
    request.headers.get("x-device-id"),
    request.headers.get("user-agent"),
  );

  return new NextResponse(result.json === null ? null : JSON.stringify(result.json), {
    status: result.status,
    headers: NO_STORE,
  });
}
