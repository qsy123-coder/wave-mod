import { NextRequest, NextResponse } from "next/server";

import { readEngagement, writeEngagement } from "@/lib/engagement/store";
import { deviceIdSchema, engagementIdsSchema, engagementWriteSchema } from "@/lib/engagement/types";

/**
 * 游客互动的读写入口：**不读 cookie、不要求登录、不碰 Supabase**。
 *
 * 为什么不带 s-maxage：响应里的 `mine` 是 per-device 状态（这台设备赞没赞过），
 * 一旦被任何共享缓存存下，A 的点赞态就会发给 B。所以一律 `private, no-store`。
 * 这一点和 `/api/mods`（公开列表，可以 public + s-maxage）正好相反，别互相抄。
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** 只认合法的匿名设备号；缺了或不合法一律当「无设备号」（读不到 mine，但写入仍拒绝） */
function readDeviceId(request: NextRequest): string | null {
  const raw = request.headers.get("x-device-id");
  if (!raw) return null;
  const parsed = deviceIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** 与 /api/mods/[id]/view 同规则：爬虫不计浏览 */
function shouldCountView(request: NextRequest): boolean {
  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  return !userAgent.includes("bot") && !userAgent.includes("spider") && !userAgent.includes("crawler");
}

export async function GET(request: NextRequest) {
  const parsedIds = engagementIdsSchema.safeParse(request.nextUrl.searchParams.get("ids") ?? "");

  if (!parsedIds.success) {
    return NextResponse.json(
      { error: parsedIds.error.issues[0]?.message ?? "参数无效。" },
      { status: 400, headers: NO_STORE }
    );
  }

  const deviceId = readDeviceId(request) ?? "";
  const { counts, mine } = readEngagement(parsedIds.data, deviceId);

  return NextResponse.json({ counts, mine }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400, headers: NO_STORE });
  }

  const parsed = engagementWriteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数无效。" },
      { status: 400, headers: NO_STORE }
    );
  }

  // 写入必须有设备号：没有它就没法去重，放行等于开了一个「无限 +1」的放大器
  const deviceId = readDeviceId(request);

  if (!deviceId) {
    return NextResponse.json({ error: "缺少合法的设备标识。" }, { status: 400, headers: NO_STORE });
  }

  if (parsed.data.action === "view" && !shouldCountView(request)) {
    return NextResponse.json({ skipped: true }, { headers: NO_STORE });
  }

  const result = await writeEngagement(parsed.data.modId, parsed.data.action, deviceId);

  return NextResponse.json(result, { headers: NO_STORE });
}
