import "server-only";

import { logger } from "@/lib/logger";

import { getEngagementBaseline } from "./baseline";
import { applyAction, computeCountsFromIncrements, computeMine, emptyState, shanghaiDayKey } from "./store-core";
import type { EngagementAction, EngagementCounts, EngagementMine, EngagementReadResult } from "./types";

/**
 * 互动计数的 **HK 自有服务** 实现。
 *
 * 背景：2026-10-24 Supabase 免费出口额度第三次被耗尽，REST 网关全站 402，
 * 计数既读不出也写不进。计数本来就不需要关系库 —— 它只是「按设备去重的累加器」，
 * 所以搬到自己的香港反代机（deploy/hk-engagement/service.py），状态落本地 JSON。
 *
 * 本文件只负责 HTTP 与「基线 + 增量」的合成；去重/累加逻辑在服务端做，
 * 展示口径（浏览量 × 65%、downloadsReal）仍只在 store-core.ts 一处。
 *
 * 开关：ENGAGEMENT_STORE=remote + ENGAGEMENT_REMOTE_URL + ENGAGEMENT_REMOTE_SECRET。
 * 与 Supabase 实现一样，不用「有 URL 就用」的判断 —— 本地 .env 里也可能有生产地址。
 */

const BASE_URL = process.env.ENGAGEMENT_REMOTE_URL?.trim().replace(/\/+$/, "") ?? "";
const SECRET = process.env.ENGAGEMENT_REMOTE_SECRET?.trim() ?? "";

/** 与应用目录上的接口截止时间一致：慢就降级，别把 /api/engagement 拖死 */
const REQUEST_TIMEOUT_MS = 5_000;

type RemoteReadResponse = {
  counts?: Record<string, Partial<EngagementCounts>>;
  mine?: Record<string, EngagementMine>;
};

type RemoteApplyResponse = {
  increments?: Partial<EngagementCounts>;
  mine?: EngagementMine;
};

export function isRemoteEngagementEnabled(): boolean {
  return (
    process.env.ENGAGEMENT_STORE?.trim() === "remote" &&
    Boolean(BASE_URL) &&
    Boolean(SECRET)
  );
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wavemod-key": SECRET,
    },
    body: JSON.stringify(body),
    // 计数必须实时；任何共享缓存都不能存它（mine 是 per-device 状态）
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`互动服务 HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

/** 读失败时退回基线。`degraded` 让前端知道「这是兜底值，别拿它覆盖首屏快照」。 */
function baselineResult(ids: string[], deviceId: string): EngagementReadResult {
  const base = getEngagementBaseline();
  const counts: Record<string, EngagementCounts> = {};
  const mine: Record<string, EngagementMine> = {};

  for (const id of ids) {
    counts[id] = computeCountsFromIncrements(base[id], {});
    if (deviceId) mine[id] = { liked: false, favorited: false };
  }

  return { counts, mine, degraded: true };
}

export async function remoteReadEngagement(ids: string[], deviceId: string): Promise<EngagementReadResult> {
  if (ids.length === 0) return { counts: {}, mine: {} };

  try {
    const data = await postJson<RemoteReadResponse>("/read", { ids, deviceId: deviceId || undefined });
    const base = getEngagementBaseline();
    const counts: Record<string, EngagementCounts> = {};
    const mine: Record<string, EngagementMine> = {};

    for (const id of ids) {
      counts[id] = computeCountsFromIncrements(base[id], data.counts?.[id] ?? {});
      if (deviceId) mine[id] = data.mine?.[id] ?? { liked: false, favorited: false };
    }

    return { counts, mine };
  } catch (error) {
    logger.warn("[engagement] HK 计数服务读取失败，本次按基线返回", {
      error: error instanceof Error ? error.message : String(error),
    });
    return baselineResult(ids, deviceId);
  }
}

/**
 * 写一次互动。服务端原子完成「去重 + 累加 + 落盘」，这里只把增量合成为展示值。
 *
 * 失败时与 Supabase 实现同一条原则：不让请求 500。但会带 `degraded`，
 * 让前端保留乐观值，而不是用基线 0 把用户的点击结果盖掉。
 */
export async function remoteWriteEngagement(
  modId: string,
  action: EngagementAction,
  deviceId: string,
): Promise<EngagementReadResult> {
  const day = shanghaiDayKey();

  try {
    const data = await postJson<RemoteApplyResponse>("/apply", { modId, action, deviceId, day });
    const base = getEngagementBaseline();

    return {
      counts: { [modId]: computeCountsFromIncrements(base[modId], data.increments ?? {}) },
      mine: { [modId]: data.mine ?? { liked: false, favorited: false } },
    };
  } catch (error) {
    logger.error("[engagement] HK 计数服务写入失败（本次只在响应里生效，不会落库）", {
      modId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });

    // 与 Supabase 实现一致：用空增量叠加这次动作，至少让用户看到「点了有反馈」
    const state = emptyState();
    applyAction(state, action, modId, deviceId, day);
    const base = getEngagementBaseline();

    return {
      counts: { [modId]: computeCountsFromIncrements(base[modId], {
        likes: state.mods[modId]?.likedBy.length ?? 0,
        favorites: state.mods[modId]?.favoritedBy.length ?? 0,
        views: state.mods[modId]?.views ?? 0,
        downloads: state.mods[modId]?.downloads ?? 0,
      }) },
      mine: { [modId]: computeMine(state, modId, deviceId) },
      degraded: true,
    };
  }
}

/** 「我的收藏」：服务端按收藏时间倒序返回 id */
export async function remoteReadFavoritedIds(deviceId: string): Promise<string[]> {
  if (!deviceId) return [];

  try {
    const response = await fetch(
      `${BASE_URL}/favorited?deviceId=${encodeURIComponent(deviceId)}`,
      {
        headers: { "x-wavemod-key": SECRET },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) throw new Error(`互动服务 HTTP ${response.status}`);

    const data = (await response.json()) as { ids?: string[] };
    return data.ids ?? [];
  } catch (error) {
    logger.warn("[engagement] HK 计数服务收藏清单读取失败，返回空列表", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** 排查用：当前是不是 HK 服务模式 */
export function describeRemoteStore() {
  return {
    mode: "remote-http" as const,
    storeFlag: process.env.ENGAGEMENT_STORE?.trim() || "(未设置)",
    url: BASE_URL || "(未设置)",
  };
}
