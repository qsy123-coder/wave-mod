import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { getEngagementBaseline } from "./baseline";
import {
  applyAction,
  computeCounts,
  computeCountsFromIncrements,
  computeMine,
  emptyState,
  shanghaiDayKey,
} from "./store-core";
import type { EngagementAction, EngagementCounts, EngagementMine, EngagementReadResult } from "./types";

/**
 * 互动计数的 **Supabase Postgres** 实现。
 *
 * 背景：2026-10-19 实测 Vercel 函数到广州 COS 的 TCP 连接不通（每次 getObject
 * 40s 才 ETIMEDOUT），`/api/engagement` 要 41 秒才返回，点赞/收藏根本落不了库。
 * Vercel → Supabase（首尔）实测 0.94s，所以计数改存这里。
 *
 * 为什么它不是「又一个读改写」：
 *   - 表结构拆成 `engagement_totals`（三个计数）+ `engagement_devices`（设备状态），
 *     写入走 `engagement_apply` 这个 plpgsql 函数：先插设备行、再 SELECT ... FOR UPDATE，
 *     同一 (mod_id, device_id) 的并发请求在数据库里串行化，计数只按真实状态变化增减。
 *   - 对比 COS 分片方案的「读整片 → 改 → 写回」：这里不会丢更新。
 *
 * 计数口径没变：**基线（随代码部署的 JSON）+ 本表增量**，
 * 展示时统一走 `computeCountsFromIncrements`。
 *
 * 开关：只有显式设置 `ENGAGEMENT_STORE=supabase` 才启用。
 * 不用「有密钥就用」的判断 —— 本地 .env.local 也带着生产 Supabase 密钥，
 * 那种写法会让 `npm run dev` 往线上库写测试数据。
 */

const QUERY_TIMEOUT_MS = 10_000;

type ReadRow = {
  counts: Record<string, { likes: number; favorites: number; views: number }>;
  mine: Record<string, { liked: boolean; favorited: boolean }>;
};
type ApplyRow = { likes: number; favorites: number; views: number; liked: boolean; favorited: boolean };

export function isSupabaseEngagementEnabled(): boolean {
  return (
    process.env.ENGAGEMENT_STORE?.trim() === "supabase" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  );
}

function getAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");
  return admin;
}

/** 网络抖动时别让互动接口挂住：Supabase 客户端本身没有超时选项 */
function withTimeout<T>(thenable: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}：Supabase 超时（${QUERY_TIMEOUT_MS}ms）`)),
      QUERY_TIMEOUT_MS,
    );
  });

  return Promise.race([Promise.resolve(thenable), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function baselineCounts(id: string): EngagementCounts {
  return computeCountsFromIncrements(getEngagementBaseline()[id], {});
}

/**
 * 单次 RPC 的 id 上限。
 *
 * `sort=hot` 会一次传入整表（约 5300 条），id 放进请求体本身没问题，但分成 1000
 * 一批并发拿更稳：单条 SQL 的 `any(array)` 更小、失败影响面也更小。
 */
const READ_CHUNK_SIZE = 1_000;
const READ_CHUNK_CONCURRENCY = 4;

async function readChunk(ids: string[], deviceId: string): Promise<ReadRow> {
  const admin = getAdmin();
  const { data, error } = await withTimeout(
    admin.rpc("engagement_read", {
      p_ids: ids,
      p_device_id: deviceId || null,
    }),
    "读取互动计数",
  );

  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Partial<ReadRow>;

  return { counts: row.counts ?? {}, mine: row.mine ?? {} };
}

/** 批量读：一次 RPC 拿增量与设备状态，按 1000 一批并发（最多 4 路） */
export async function supabaseReadEngagement(ids: string[], deviceId: string): Promise<EngagementReadResult> {
  const counts: Record<string, EngagementCounts> = {};
  const mine: Record<string, EngagementMine> = {};

  if (ids.length === 0) return { counts, mine };

  try {
    const chunks: string[][] = [];
    for (let offset = 0; offset < ids.length; offset += READ_CHUNK_SIZE) {
      chunks.push(ids.slice(offset, offset + READ_CHUNK_SIZE));
    }

    const rows: ReadRow[] = [];
    for (let offset = 0; offset < chunks.length; offset += READ_CHUNK_CONCURRENCY) {
      const batch = chunks.slice(offset, offset + READ_CHUNK_CONCURRENCY);
      rows.push(...(await Promise.all(batch.map((chunk) => readChunk(chunk, deviceId)))));
    }

    const base = getEngagementBaseline();

    for (const id of ids) {
      let likes = 0;
      let favorites = 0;
      let views = 0;
      let mineRow: EngagementMine | undefined;

      for (const row of rows) {
        const increment = row.counts[id];
        if (increment) {
          likes += Number(increment.likes ?? 0);
          favorites += Number(increment.favorites ?? 0);
          views += Number(increment.views ?? 0);
        }

        const device = row.mine[id];
        if (device) mineRow = device;
      }

      counts[id] = computeCountsFromIncrements(base[id], { likes, favorites, views });
      if (deviceId) mine[id] = { liked: mineRow?.liked ?? false, favorited: mineRow?.favorited ?? false };
    }

    return { counts, mine };
  } catch (error) {
    // 降级为「只见基线」：数字不涨比接口 500 好，而且必须在日志里留痕
    logger.warn("[engagement] Supabase 读取失败，本次按基线返回", {
      error: error instanceof Error ? error.message : String(error),
    });

    for (const id of ids) {
      counts[id] = baselineCounts(id);
      if (deviceId) mine[id] = { liked: false, favorited: false };
    }

    return { counts, mine };
  }
}

/** 写一次互动：计数器增减在数据库函数里原子完成 */
export async function supabaseWriteEngagement(
  modId: string,
  action: EngagementAction,
  deviceId: string,
): Promise<EngagementReadResult> {
  const day = shanghaiDayKey();

  try {
    const admin = getAdmin();
    const { data, error } = await withTimeout(
      admin.rpc("engagement_apply", {
        p_mod_id: modId,
        p_action: action,
        p_device_id: deviceId,
        p_day: day,
      }),
      "写入互动",
    );

    if (error) throw new Error(error.message);

    const row = data as unknown as ApplyRow | null;
    if (!row) throw new Error("engagement_apply 没有返回结果");

    return {
      counts: {
        [modId]: computeCountsFromIncrements(getEngagementBaseline()[modId], {
          likes: Number(row.likes),
          favorites: Number(row.favorites),
          views: Number(row.views),
        }),
      },
      mine: { [modId]: { liked: Boolean(row.liked), favorited: Boolean(row.favorited) } },
    };
  } catch (error) {
    // 写失败不能让请求 500：用空增量叠加这次动作，保证「点了有反馈」。
    // 与 COS 实现同一条原则：失败必须可见，但用户不该看到错误页。
    logger.error("[engagement] Supabase 写入失败（本次只在响应里生效，不会落库）", {
      modId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });

    const state = emptyState();
    applyAction(state, action, modId, deviceId, day);
    const base = getEngagementBaseline();

    return {
      counts: { [modId]: computeCounts(state, base, modId) },
      mine: { [modId]: computeMine(state, modId, deviceId) },
    };
  }
}

/** 「我的收藏」：按收藏时间倒序，直接由数据库排序 */
export async function supabaseReadFavoritedIds(deviceId: string): Promise<string[]> {
  if (!deviceId) return [];

  try {
    const admin = getAdmin();
    const { data, error } = await withTimeout(
      admin
        .from("engagement_devices")
        .select("mod_id")
        .eq("device_id", deviceId)
        .eq("favorited", true)
        .order("favorited_at", { ascending: false }),
      "读取收藏清单",
    );

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.mod_id);
  } catch (error) {
    logger.warn("[engagement] Supabase 收藏清单读取失败，返回空列表", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** 排查用：当前是不是 Postgres 模式 */
export function describeSupabaseStore() {
  return {
    mode: "supabase-postgres" as const,
    storeFlag: process.env.ENGAGEMENT_STORE?.trim() || "(未设置)",
  };
}
