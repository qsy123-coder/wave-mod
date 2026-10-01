import { NextRequest, NextResponse } from "next/server";

import { readFavoritedIds } from "@/lib/engagement/store";
import { deviceIdSchema } from "@/lib/engagement/types";

/**
 * 「我的收藏」的 id 清单：按设备号返回这台机器收藏过的 MOD id（最近收藏在前）。
 *
 * 不返回 mod 内容 —— 内容走 `/api/mods/by-ids`，那样它就能吃到公开缓存，
 * 这里只回一串 id，天然是 per-device 的，必须 `private, no-store`。
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest) {
  const parsed = deviceIdSchema.safeParse(request.headers.get("x-device-id") ?? "");

  // 没设备号 = 这台机器没收藏过任何东西，不是错误
  if (!parsed.success) {
    return NextResponse.json({ ids: [] }, { headers: NO_STORE });
  }

  return NextResponse.json({ ids: readFavoritedIds(parsed.data) }, { headers: NO_STORE });
}
