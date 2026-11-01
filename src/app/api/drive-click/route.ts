import { NextRequest, NextResponse } from "next/server";

import { recordDriveClick } from "@/lib/drive-stats/store";
import { handleDriveClickPost } from "@/lib/drive-stats/web-api";

/**
 * 网盘点击打点入口。
 *
 * 响应**永远是 204**：打点是 fire-and-forget，请求体、设备号、机器人过滤任何一项
 * 不合法都只是「这次不计」，不该让页面看到一个错误。
 *
 * 校验在 `@/lib/drive-stats/web-api`，与访问打点（`/api/visits`）同一套风格。
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);

  const result = await handleDriveClickPost(
    recordDriveClick,
    body,
    request.headers.get("x-device-id"),
    request.headers.get("user-agent"),
  );

  return new NextResponse(result.json === null ? null : JSON.stringify(result.json), {
    status: result.status,
    headers: NO_STORE,
  });
}
