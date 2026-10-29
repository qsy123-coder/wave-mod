import { NextRequest, NextResponse } from "next/server";

import { readEngagement, writeEngagement } from "@/lib/engagement/store";
import {
  handleEngagementGet,
  handleEngagementPost,
  type ApiResult,
  type EngagementApiStore,
} from "@/lib/engagement/web-api";

/**
 * 游客互动的读写入口：**不读 cookie、不要求登录、不碰 Supabase**。
 *
 * 为什么不带 s-maxage：响应里的 `mine` 是 per-device 状态（这台设备赞没赞过），
 * 一旦被任何共享缓存存下，A 的点赞态就会发给 B。所以一律 `private, no-store`。
 * 这一点和 `/api/mods`（公开列表，可以 public + s-maxage）正好相反，别互相抄。
 *
 * 校验与响应体在 `@/lib/engagement/web-api`：香港边缘服务跑的是同一份，
 * 见 deploy/hk-edge-api/server.ts。
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** 这个宿主注入全量分派（remote / supabase / COS / 本地文件） */
const store: EngagementApiStore = { read: readEngagement, write: writeEngagement };

function respond(result: ApiResult) {
  return NextResponse.json(result.json, { status: result.status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  return respond(
    await handleEngagementGet(
      store,
      request.nextUrl.searchParams.get("ids"),
      request.headers.get("x-device-id"),
    ),
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400, headers: NO_STORE },
    );
  }

  return respond(
    await handleEngagementPost(
      store,
      body,
      request.headers.get("x-device-id"),
      request.headers.get("user-agent"),
    ),
  );
}
