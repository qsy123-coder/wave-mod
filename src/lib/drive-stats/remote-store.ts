import "server-only";

import { logger } from "@/lib/logger";
import { isVisitsRemoteEnabled } from "@/lib/visits/remote-store";

import type { DrivePlatformRow } from "./types";

/**
 * 网盘点击统计的 **HK 自有服务** 实现。
 *
 * 与访问统计共用同一台机器、同一套密钥和同一个开关（`isVisitsRemoteEnabled`），
 * 因为服务端 `/drive-click`、`/drive-stats` 本来就挂在同一份 state 上。
 */

const BASE_URL = process.env.ENGAGEMENT_REMOTE_URL?.trim().replace(/\/+$/, "") ?? "";
const SECRET = process.env.ENGAGEMENT_REMOTE_SECRET?.trim() ?? "";

/** 与 /api/engagement 一致的截止时间：慢就降级，别把打点拖成页面卡顿 */
const REQUEST_TIMEOUT_MS = 5_000;

function toCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

/**
 * 记一次网盘点击。
 *
 * 失败只记日志、不抛：打点在页面后台进行，任何错误都不该被访客看见，
 * 也不该让 `keepalive` 请求把页面卸载流程拖住。
 */
export async function remoteRecordDriveClick(
  platform: string,
  deviceId: string,
  today: string,
): Promise<void> {
  if (!isVisitsRemoteEnabled()) return;

  try {
    const response = await fetch(`${BASE_URL}/drive-click`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wavemod-key": SECRET,
      },
      // day 与 today 目前同值；分开传是为了跨零点的迟到请求仍能归到正确的一天
      body: JSON.stringify({ deviceId, platform, day: today, today }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`网盘点击服务 HTTP ${response.status}`);
  } catch (error) {
    logger.warn("[drive-stats] 网盘点击打点失败（不影响页面）", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 读最近 N 天的平台数据。
 *
 * 返回 `null` 表示「读不到」——页面据此显示「数据暂不可用」，
 * **绝不能退化成空数组**：补零之后看起来就是「这几天一次点击都没有」。
 */
export async function remoteReadDrivePlatforms(
  days: number,
  today: string,
): Promise<DrivePlatformRow[] | null> {
  if (!isVisitsRemoteEnabled()) return null;

  try {
    const query = `days=${encodeURIComponent(String(days))}&today=${encodeURIComponent(today)}`;
    const response = await fetch(`${BASE_URL}/drive-stats?${query}`, {
      headers: { "x-wavemod-key": SECRET },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`网盘点击服务 HTTP ${response.status}`);

    const data = (await response.json()) as { platforms?: unknown };
    if (!Array.isArray(data.platforms)) throw new Error("响应格式不正确");

    return data.platforms
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => {
        const rawDays = Array.isArray(row.days) ? row.days : [];
        return {
          platform: String(row.platform ?? "").trim(),
          total: toCount(row.total),
          days: rawDays
            .filter((day): day is Record<string, unknown> => typeof day === "object" && day !== null)
            .map((day) => ({ date: String(day.date ?? ""), count: toCount(day.count) }))
            .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date)),
        };
      })
      .filter((row) => row.platform.length > 0);
  } catch (error) {
    logger.warn("[drive-stats] 网盘点击读取失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
