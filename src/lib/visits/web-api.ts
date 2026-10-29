import "server-only";

import { isCountableUserAgent, readDeviceId } from "@/lib/engagement/web-api";

import type { ApiResult } from "@/lib/engagement/web-api";

/**
 * `/api/visits` 的浏览器协议层。宿主有两个（Next 路由 / 香港边缘服务），
 * 与 `engagement/web-api.ts` 同一套理由：只写一份校验。
 */

/**
 * 打点是 fire-and-forget：请求体、设备号、机器人过滤任何一项不合法都只是
 * 「这次不计」，**永远回 204**，不该让页面看到一个错误。
 */
export async function handleVisitPost(
  record: (deviceId: string) => Promise<void>,
  deviceIdRaw: string | null,
  userAgent: string | null,
): Promise<ApiResult> {
  const deviceId = readDeviceId(deviceIdRaw);

  if (!deviceId || !isCountableUserAgent(userAgent)) {
    return { status: 204, json: null };
  }

  await record(deviceId);

  return { status: 204, json: null };
}
