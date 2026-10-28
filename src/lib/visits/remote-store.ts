import "server-only";

import { logger } from "@/lib/logger";

import type { VisitRow } from "./types";

/**
 * 访问统计的 **HK 自有服务** 实现（与互动计数同一台机器、同一套密钥）。
 *
 * 为什么复用香港服务而不是新建一张 Supabase 表：Supabase 免费出口额度已经
 * 三次被打穿，2026-10 起连 Auth 都是 402。访问统计恰恰是「额度挂了也要能看」
 * 的那类数据，放进去等于给自己留一个必然失效的仪表盘。
 *
 * 开关与 remote-store 完全一致（ENGAGEMENT_STORE=remote + URL + SECRET）：
 * 本地 `.env` 里也可能写着生产地址，不能靠「有 URL 就用」来判断。
 */

const BASE_URL = process.env.ENGAGEMENT_REMOTE_URL?.trim().replace(/\/+$/, "") ?? "";
const SECRET = process.env.ENGAGEMENT_REMOTE_SECRET?.trim() ?? "";

/** 与 /api/engagement 一致的截止时间：慢就降级，别把打点拖成页面卡顿 */
const REQUEST_TIMEOUT_MS = 5_000;

export function isVisitsRemoteEnabled(): boolean {
  return (
    process.env.ENGAGEMENT_STORE?.trim() === "remote" &&
    Boolean(BASE_URL) &&
    Boolean(SECRET)
  );
}

/**
 * 记一次页面浏览。
 *
 * 失败只记日志、不抛：打点在页面后台进行，任何错误都不该被访客看见，
 * 更不该让 `keepalive` 请求把页面卸载流程拖住。
 */
export async function remoteRecordVisit(deviceId: string, today: string): Promise<void> {
  if (!isVisitsRemoteEnabled()) return;

  try {
    const response = await fetch(`${BASE_URL}/visit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wavemod-key": SECRET,
      },
      // day 与 today 目前同值；分开传是为了跨零点的迟到请求仍能归到正确的一天
      body: JSON.stringify({ deviceId, day: today, today }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`访问统计服务 HTTP ${response.status}`);
  } catch (error) {
    logger.warn("[visits] 访问打点失败（不影响页面）", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 读最近 N 天。
 *
 * 返回 `null` 表示「读不到」——页面据此显示「数据暂不可用」，
 * **绝不能退化成空数组**：补零之后看起来就是「这几天一个人都没来」。
 */
export async function remoteReadVisitDays(days: number, today: string): Promise<VisitRow[] | null> {
  if (!isVisitsRemoteEnabled()) return null;

  try {
    const url = `${BASE_URL}/visits?days=${encodeURIComponent(String(days))}&today=${encodeURIComponent(today)}`;
    const response = await fetch(url, {
      headers: { "x-wavemod-key": SECRET },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`访问统计服务 HTTP ${response.status}`);

    const data = (await response.json()) as { days?: unknown };
    if (!Array.isArray(data.days)) throw new Error("响应格式不正确");

    return data.days
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => ({
        date: String(row.date ?? ""),
        uv: Number(row.uv ?? 0),
        pv: Number(row.pv ?? 0),
      }))
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
  } catch (error) {
    logger.warn("[visits] 访问统计读取失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
