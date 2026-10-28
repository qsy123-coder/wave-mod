import { NextRequest, NextResponse } from "next/server";

import { deviceIdSchema } from "@/lib/engagement/schemas";
import { recordVisit } from "@/lib/visits/store";

/**
 * 站点访问打点入口。
 *
 * 为什么是 POST 而不是在页面渲染时计数：站点页面是静态渲染 + 香港 nginx 缓存的，
 * 服务端根本不会为每一次访问都执行一次渲染。只有浏览器发出来的请求才是「真的有人来了」。
 *
 * 响应**永远是 204**：打点是 fire-and-forget，请求体、设备号、机器人过滤任何一项
 * 不合法都只是「这次不计」，不该让页面看到一个错误。
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** 与 /api/engagement 同规则：爬虫不计，否则数字会被抓取流量抬穿 */
function shouldCount(request: NextRequest): boolean {
  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  return !userAgent.includes("bot") && !userAgent.includes("spider") && !userAgent.includes("crawler");
}

export async function POST(request: NextRequest) {
  const parsed = deviceIdSchema.safeParse(request.headers.get("x-device-id") ?? "");

  if (!parsed.success || !shouldCount(request)) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  await recordVisit(parsed.data);

  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
