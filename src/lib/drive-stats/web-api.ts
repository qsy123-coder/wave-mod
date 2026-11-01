import "server-only";

import { z } from "zod";

import { isCountableUserAgent, readDeviceId } from "@/lib/engagement/web-api";
import type { ApiResult } from "@/lib/engagement/web-api";

import { normalizeDrivePlatform } from "./platform";

/**
 * `/api/drive-click` 的浏览器协议层。
 *
 * 打点是 fire-and-forget：请求体、设备号、机器人过滤任何一项不合法都只是
 * 「这次不计」，**永远回 204**，不该让页面看到一个错误。
 */

const driveClickSchema = z.object({
  // 先收宽一点（自由文本可能带「（备用）」这类尾巴），归一化后才是真正的桶名
  platform: z.string().trim().min(1).max(64),
});

export async function handleDriveClickPost(
  record: (platform: string, deviceId: string) => Promise<void>,
  bodyRaw: unknown,
  deviceIdRaw: string | null,
  userAgent: string | null,
): Promise<ApiResult> {
  const parsed = driveClickSchema.safeParse(bodyRaw);
  const deviceId = readDeviceId(deviceIdRaw);

  if (!parsed.success || !deviceId || !isCountableUserAgent(userAgent)) {
    return { status: 204, json: null };
  }

  const platform = normalizeDrivePlatform(parsed.data.platform);
  if (!platform) return { status: 204, json: null };

  try {
    await record(platform, deviceId);
  } catch {
    // 计数失败静默丢弃：网盘点击不是关键路径
  }

  return { status: 204, json: null };
}
