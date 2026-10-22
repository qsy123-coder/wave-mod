import "server-only";

import { logger } from "@/lib/logger";

import { getEngagementBaseline } from "./baseline";
import { engagementShardIndex, engagementShardKey, ENGAGEMENT_SHARD_COUNT } from "./shard";
import {
  applyAction,
  computeCounts,
  computeMine,
  emptyState,
  listFavoritedIds,
  parseState,
  pruneDayBuckets,
  shanghaiDayKey,
  type EngagementState,
} from "./store-core";
import type { EngagementAction, EngagementCounts, EngagementMine, EngagementReadResult } from "./types";

export type { EngagementReadResult };

/**
 * 互动计数的 **COS 分片存储**。
 *
 * 背景：计数原来落在服务器本地 `data/runtime/engagement.json`，Vercel 这类无状态环境
 * 既没有持久盘、多实例之间也不共享内存 —— 这套实现把状态切成 16 个 COS 对象。
 *
 * 为什么是「分片 + 读缓存 + 单分片串行写」而不是别的：
 *   - COS **没有原子自增**，任何写都是「读整片 → 改 → 写回」，并发写会互相覆盖；
 *   - 分 16 片后，冲突只可能发生在同一片内（约 1/16 的写），日常写入约 1500 次/天，
 *     同片并发实际极少；
 *   - 读侧按 mod.id 只取需要的分片，并用 60s 内存缓存兜住高频的 `/api/engagement`
 *     （每天约 1.1 万次读）—— 与 PRD 的「最终一致 ≤ 60s」对齐。
 *
 * ⚠️ 已知取舍：极端并发（例如同一资源瞬间 50 个赞）下，落在同一分片的写会丢掉个别
 * 增量。计数是展示性质，用户自己的点赞态由写入方当场返回，不受影响。
 *
 * 数据布局：
 *   engagement/v2/shard-<0..15>.json   每片是一个完整的 EngagementState
 *   基线仍是随代码部署的 data/engagement-baseline.json（见 baseline.ts）
 */

const BUCKET = () => process.env.COS_BUCKET?.trim() ?? "";
const REGION = () => process.env.COS_REGION?.trim() ?? "";
const SECRET_ID = () => process.env.COS_SECRET_ID?.trim() ?? "";
const SECRET_KEY = () => process.env.COS_SECRET_KEY?.trim() ?? "";

/** 读缓存 TTL：与「最终一致 ≤ 60s」的验收标准一致 */
const SHARD_CACHE_TTL_MS = 60_000;
const SHARD_COUNT = ENGAGEMENT_SHARD_COUNT;

/**
 * 分片读取的并发上限。
 *
 * 16 个分片同时开 16 条 TLS 连接，在 Vercel 冷启动的容器里会集体 ETIMEDOUT
 * （2026-10-19 实测：`sort=hot` 一次列表要读全部分片，冷启动时 16 条全超时，
 * 接口被拖到 40 秒以上并降级成全 0）。限到 4 路后同一环境下为 0.6–0.8s。
 */
const SHARD_FETCH_CONCURRENCY = 4;

/**
 * 单次 COS 请求的墙钟上限。
 *
 * SDK 的 `Timeout: 10_000` **管不住 TCP 建连**：2026-10-19 在 Vercel 上实测，
 * 每次 getObject 要 40 秒才 ETIMEDOUT，`/api/engagement` 因此 41 秒才返回。
 * 这里自己套一层截止时间，慢的请求直接判失败，交给下面的熔断兜住。
 */
const COS_CALL_TIMEOUT_MS = 5_000;

/**
 * 熔断冷却：一次网络失败后，这个实例在 60 秒内不再尝试 COS。
 *
 * 没有它，一次列表页要读 16 个分片，每个都等满 5 秒，用户照样要等半分钟。
 * 冷却期内的读取直接返回「空增量」（展示基线值），写入返回乐观结果但不落库 ——
 * 都是已知取舍，换来的是接口 200 毫秒级返回，而不是把整站拖死。
 */
const COS_FAILURE_COOLDOWN_MS = 60_000;
let cosDownUntil = 0;

/** 网络层失败才算「不可达」；JSON 坏了是数据问题，不该触发熔断 */
function isNetworkFailure(message: string): boolean {
  return /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|COS 请求超时/i.test(
    message,
  );
}

function isCircuitOpen(): boolean {
  return Date.now() < cosDownUntil;
}

function noteCosFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (isNetworkFailure(message)) cosDownUntil = Date.now() + COS_FAILURE_COOLDOWN_MS;
}

function noteCosSuccess(): void {
  cosDownUntil = 0;
}

/** 给 Promise 套一个硬截止时间（SDK 的超时不可靠，见 COS_CALL_TIMEOUT_MS） */
function withDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}：COS 请求超时（${COS_CALL_TIMEOUT_MS}ms）`)),
      COS_CALL_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** 简单并发池：按上限分批跑，保持输入顺序 */
async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function isCosEngagementEnabled(): boolean {
  return Boolean(SECRET_ID() && SECRET_KEY() && BUCKET() && REGION());
}

/** 最小化的 COS 客户端形状 —— 只用到 getObject / putObject，不引全量类型 */
type CosClient = {
  getObject: (
    params: Record<string, unknown>,
    callback: (error: (Error & { statusCode?: number }) | null, data?: { Body?: unknown }) => void,
  ) => void;
  putObject: (
    params: Record<string, unknown>,
    callback: (error: Error | null) => void,
  ) => void;
};

let cosClientPromise: Promise<CosClient> | null = null;

/** 延迟加载 SDK：不给互动接口的冷启动平白加一份依赖解析 */
function getCosClient(): Promise<CosClient> {
  if (!cosClientPromise) {
    cosClientPromise = import("cos-nodejs-sdk-v5").then(({ default: COS }) => {
      return new (COS as unknown as new (options: Record<string, unknown>) => CosClient)({
        SecretId: SECRET_ID(),
        SecretKey: SECRET_KEY(),
        Timeout: 10_000,
      });
    });
  }

  return cosClientPromise;
}

/** 分片缓存：成功读到才写入，读失败不缓存（避免把故障记住 60 秒） */
const shardCache = new Map<number, { state: EngagementState; at: number }>();
const shardInflight = new Map<number, Promise<EngagementState>>();

/**
 * 读一个分片对象。
 *
 * 404 = 该片还没有任何互动（迁移后已存在）；解析失败时**抛错**而不是返回空状态 ——
 * 空状态被写回就等于把整片清零，比读不到更难查。
 */
async function readShardObject(index: number): Promise<EngagementState> {
  const cos = await getCosClient();
  const key = engagementShardKey(index);

  const body = await withDeadline(
    new Promise<string | null>((resolve, reject) => {
      cos.getObject({ Bucket: BUCKET(), Region: REGION(), Key: key }, (error, data) => {
        if (error) {
          if (error.statusCode === 404) {
            resolve(null);
            return;
          }
          reject(new Error(`COS getObject 失败：${error.message}`));
          return;
        }

        if (data?.Body === undefined || data.Body === null) {
          resolve(null);
          return;
        }

        resolve(typeof data.Body === "string" ? data.Body : Buffer.from(data.Body as ArrayBuffer).toString("utf8"));
      });
    }),
    `读取分片 ${index}`,
  ).catch((error) => {
    noteCosFailure(error);
    throw error;
  });

  // 能读到就说明链路是通的，立刻解除熔断（不必等冷却到期）
  noteCosSuccess();


  if (!body) return emptyState();

  try {
    return parseState(JSON.parse(body));
  } catch (cause) {
    throw new Error(`分片 ${key} 不是合法 JSON`, { cause });
  }
}

async function loadShard(index: number, options: { fresh?: boolean } = {}): Promise<EngagementState> {
  const fresh = options.fresh ?? false;
  const cached = shardCache.get(index);
  if (!fresh && cached && Date.now() - cached.at < SHARD_CACHE_TTL_MS) {
    return cached.state;
  }

  // 熔断期内不再发网络请求：没有缓存可用就立刻失败，让调用方走基线/空增量。
  // 写入（fresh=true）同样不尝试 —— 反正也要等满超时。
  if (isCircuitOpen()) {
    throw new Error("COS 暂时不可达（熔断中）");
  }

  // 同一实例内的并发读合并成一次网络请求（与 write 的 fresh 读分开）
  if (!fresh) {
    const inflight = shardInflight.get(index);
    if (inflight) return inflight;
  }

  const promise = readShardObject(index)
    .then((state) => {
      shardCache.set(index, { state, at: Date.now() });
      return state;
    })
    .finally(() => {
      shardInflight.delete(index);
    });

  shardInflight.set(index, promise);
  return promise;
}

async function saveShard(index: number, state: EngagementState): Promise<void> {
  const cos = await getCosClient();

  await withDeadline(
    new Promise<void>((resolve, reject) => {
      cos.putObject(
        {
          Bucket: BUCKET(),
          Region: REGION(),
          Key: engagementShardKey(index),
          Body: Buffer.from(JSON.stringify(state), "utf8"),
          ContentType: "application/json",
          // 计数对象不能被任何共享缓存存住：每次都要拿最新的
          CacheControl: "no-store",
        },
        (error) => (error ? reject(new Error(`COS putObject 失败：${error.message}`)) : resolve()),
      );
    }),
    `写入分片 ${index}`,
  ).catch((error) => {
    noteCosFailure(error);
    throw error;
  });

  noteCosSuccess();
  shardCache.set(index, { state, at: Date.now() });
}

/** 同一分片的写串行化（跨实例无法串行，但至少同实例内不互相踩） */
const writeChains = new Map<number, Promise<unknown>>();

function runExclusive<T>(index: number, task: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(index) ?? Promise.resolve();
  const result = previous.then(task, task);
  writeChains.set(
    index,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/** 批量读：按 mod.id 路由到分片，只取需要的那几片 */
export async function cosReadEngagement(ids: string[], deviceId: string): Promise<EngagementReadResult> {
  const idsByShard = new Map<number, string[]>();

  for (const id of ids) {
    const index = engagementShardIndex(id);
    const bucket = idsByShard.get(index);
    if (bucket) bucket.push(id);
    else idsByShard.set(index, [id]);
  }

  const loaded = await mapLimit(
    [...idsByShard.entries()],
    SHARD_FETCH_CONCURRENCY,
    async ([index, shardIds]) => {
      try {
        return { shardIds, state: await loadShard(index) };
      } catch (error) {
        // 读失败降级为空增量：计数显示为基线值，但接口不报错
        logger.warn("[engagement] COS 分片读取失败，本次按空增量返回", {
          shard: index,
          error: error instanceof Error ? error.message : String(error),
        });
        return { shardIds, state: emptyState() };
      }
    },
  );

  const base = getEngagementBaseline();
  const counts: Record<string, EngagementCounts> = {};
  const mine: Record<string, EngagementMine> = {};

  for (const { shardIds, state } of loaded) {
    for (const id of shardIds) {
      counts[id] = computeCounts(state, base, id);
      if (deviceId) mine[id] = computeMine(state, id, deviceId);
    }
  }

  return { counts, mine };
}

/** 写一次互动：读新分片 → 应用 → 写回。写失败不阻塞响应，但必须留日志 */
export async function cosWriteEngagement(
  modId: string,
  action: EngagementAction,
  deviceId: string,
): Promise<EngagementReadResult> {
  const index = engagementShardIndex(modId);

  return runExclusive(index, async () => {
    const day = shanghaiDayKey();
    const base = getEngagementBaseline();

    // 读不到分片（熔断 / 超时 / 网络错误）时不能让请求 500：
    // 用空增量叠加这次动作，至少让用户看到「点了」的即时反馈。代价是刷新后丢失，
    // 必须在日志里留痕 —— 静默丢写入正是上一版最致命的问题。
    let state: EngagementState;
    try {
      state = await loadShard(index, { fresh: true });
    } catch (error) {
      logger.warn("[engagement] COS 不可达，本次互动只在内存生效（不会落库）", {
        modId,
        action,
        shard: index,
        error: error instanceof Error ? error.message : String(error),
      });

      state = emptyState();
      applyAction(state, action, modId, deviceId, day);

      return {
        counts: { [modId]: computeCounts(state, base, modId) },
        mine: { [modId]: computeMine(state, modId, deviceId) },
      };
    }

    applyAction(state, action, modId, deviceId, day);
    pruneDayBuckets(state, day, 2);

    try {
      await saveShard(index, state);
    } catch (error) {
      logger.error("[engagement] COS 分片写回失败（本实例已更新，其他实例 60s 内看不到）", {
        modId,
        action,
        shard: index,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      counts: { [modId]: computeCounts(state, base, modId) },
      mine: { [modId]: computeMine(state, modId, deviceId) },
    };
  });
}

/** 「我的收藏」：需要扫全部分片（低频路径，缓存命中时是纯内存扫描） */
export async function cosReadFavoritedIds(deviceId: string): Promise<string[]> {
  if (!deviceId) return [];

  const states = await mapLimit(
    Array.from({ length: SHARD_COUNT }, (_, index) => index),
    SHARD_FETCH_CONCURRENCY,
    (index) =>
      loadShard(index).catch((error) => {
        logger.warn("[engagement] COS 分片读取失败（我的收藏），跳过该片", {
          shard: index,
          error: error instanceof Error ? error.message : String(error),
        });
        return emptyState();
      }),
  );

  const merged = emptyState();
  for (const state of states) Object.assign(merged.mods, state.mods);

  return listFavoritedIds(merged, deviceId);
}

/** 排查用：当前是不是 COS 模式、缓存里有多少片 */
export function describeCosStore() {
  return {
    mode: "cos-shards" as const,
    shardCount: SHARD_COUNT,
    cachedShards: shardCache.size,
    cacheTtlMs: SHARD_CACHE_TTL_MS,
  };
}
