import "server-only";

import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "@/lib/logger";

import {
  applyAction,
  computeCounts,
  computeMine,
  listFavoritedIds,
  parseBaseline,
  parseState,
  pruneViewDays,
  shanghaiDayKey,
  type EngagementBaseline,
  type EngagementState,
} from "./store-core";
import type { EngagementAction, EngagementCounts, EngagementMine } from "./types";

/**
 * 计数器的落盘层：把 store-core 的纯逻辑接到文件系统上。
 *
 * 为什么不是 Supabase：出口配额被打穿后网关一律回 402，互动写入会**静默**失败
 * （前台只剩冰冷的 0，没有任何报错）。这里改为落在自托管机器本地，链路里再无第三方网关。
 *
 * 两个文件，**生命周期不同，所以放在不同目录**：
 *   - `data/runtime/engagement.json`      —— 增量（新互动）。运行时唯一被写的文件，
 *     不进 git（每次部署都要保留），但**必须进备份**（见 scripts/backup-to-github.mjs）。
 *   - `data/engagement-baseline.json`     —— 基线（Supabase 历史计数，导入一次）。
 *     它是「随代码一起部署的种子」，所以**进 git**，部署到新机器开箱即用，
 *     不需要上线后再连一次数据库。
 * 分开存还有个关键好处：重跑导入脚本只是覆盖基线文件，**天然幂等**，
 * 不会把历史数字叠加两次（增量里永远不会包含基线）。
 *
 * ⚠️ 同一份默认路径在 scripts/import-engagement-baseline.mjs 里也写了一遍
 *    （那个脚本是 .mjs，跨不过 TS/mjs 的边界），改这里时记得同步。
 */

const RUNTIME_DIR = process.env.ENGAGEMENT_STORE_DIR?.trim() || join(process.cwd(), "data", "runtime");
const STATE_PATH = join(RUNTIME_DIR, "engagement.json");
const BASELINE_PATH =
  process.env.ENGAGEMENT_BASELINE_PATH?.trim() || join(process.cwd(), "data", "engagement-baseline.json");

/** 浏览去重表只保留最近两天：今天判定「是否已计过」，昨天留着兜跨零点的请求 */
const VIEW_DAY_KEEP = 2;

let state: EngagementState | null = null;
let baseline: EngagementBaseline | null = null;
let loadedMtimeMs = -1;

/** 写队列：所有落盘串行化，杜绝同进程内两个请求交错读改写 */
let writeChain: Promise<unknown> = Promise.resolve();

function readJson(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    // 文件坏掉时**不清零**：交给调用方退化成空增量，并在日志里留痕。
    // 静默清零比崩溃更难查 —— 用户只会看到数字突然归零。
    logger.warn("[engagement] 计数器文件读取失败，本次以空增量继续", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function fileMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}

function getBaseline(): EngagementBaseline {
  if (baseline) return baseline;
  baseline = parseBaseline(readJson(BASELINE_PATH));
  return baseline;
}

/**
 * 取当前状态。每次调用都拿 mtime 比一下：文件被别的进程（或多实例部署）改过就重载。
 * 单实例下这只是一次廉价的 stat；多实例下它就是防止计数互相覆盖的兜底。
 */
function getState(): EngagementState {
  const mtime = fileMtimeMs(STATE_PATH);
  if (state && mtime === loadedMtimeMs) return state;

  state = parseState(readJson(STATE_PATH));
  loadedMtimeMs = mtime;
  return state;
}

/** 原子落盘：先写临时文件再 rename，避免进程中途挂掉留下半截 JSON */
async function persist(next: EngagementState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const tmpPath = `${STATE_PATH}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(next), "utf8");
  await rename(tmpPath, STATE_PATH);
  loadedMtimeMs = fileMtimeMs(STATE_PATH);
}

/** 镜像对象：计数器全量快照，供灾难恢复时手工取回 */
const COS_MIRROR_KEY = "engagement/live.json";
/** 镜像节流：互动再频繁也最多 5 分钟传一次，绝不让它进请求的关键路径 */
const COS_MIRROR_MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastMirrorAt = 0;
let mirroring = false;

/**
 * 把计数器镜像一份到 COS（**fire-and-forget**）。
 *
 * 为什么要这一份：运行时增量落在服务器本地盘上，而机器本身没有任何异地备份 ——
 * 盘挂了就全没了。COS 是现成的、已经用惯的异地存储，代价只有每 5 分钟一次 PUT。
 *
 * 三条自我保护：
 *   1. 没配 COS 环境变量就直接跳过（本地开发/CI 不该因此报错）
 *   2. 节流 5 分钟，且同一时刻只允许一个上传在飞
 *   3. 失败只记日志 —— 计数功能**绝不能**因为镜像失败而受影响
 */
function mirrorToCos(state: EngagementState): void {
  if (mirroring) return;

  const now = Date.now();
  if (now - lastMirrorAt < COS_MIRROR_MIN_INTERVAL_MS) return;

  const secretId = process.env.COS_SECRET_ID?.trim();
  const secretKey = process.env.COS_SECRET_KEY?.trim();
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();

  if (!secretId || !secretKey || !bucket || !region) return;

  mirroring = true;
  lastMirrorAt = now;

  const body = Buffer.from(JSON.stringify(state), "utf8");

  void (async () => {
    try {
      // 延迟加载 SDK：不给互动接口的冷启动平白加一份依赖解析
      const { default: COS } = await import("cos-nodejs-sdk-v5");
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

      await new Promise<void>((resolve, reject) => {
        cos.putObject(
          { Bucket: bucket, Region: region, Key: COS_MIRROR_KEY, Body: body, ContentType: "application/json" },
          (error) => (error ? reject(error) : resolve())
        );
      });
    } catch (error) {
      // 把节流时间往回拨，让下一次互动有机会重试，而不是干等 5 分钟
      lastMirrorAt = 0;
      logger.warn("[engagement] 计数器镜像到 COS 失败（计数不受影响）", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      mirroring = false;
    }
  })();
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task, task);
  // 队列本身必须永不 reject，否则一次失败会把后续所有写操作连坐
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export type EngagementReadResult = {
  counts: Record<string, EngagementCounts>;
  mine: Record<string, EngagementMine>;
};

/** 批量读：只回当前页要的那几个 id，不做全站扫描 */
export function readEngagement(ids: string[], deviceId: string): EngagementReadResult {
  const current = getState();
  const base = getBaseline();

  const counts: Record<string, EngagementCounts> = {};
  const mine: Record<string, EngagementMine> = {};

  for (const id of ids) {
    counts[id] = computeCounts(current, base, id);
    if (deviceId) mine[id] = computeMine(current, id, deviceId);
  }

  return { counts, mine };
}

/**
 * 写一次互动并落盘。
 *
 * 落盘失败**不阻塞响应**（内存已更新，用户看到的状态是对的），但必须记日志 ——
 * 这正是上一版最致命的毛病：失败了却没有任何地方说。
 */
export async function writeEngagement(
  modId: string,
  action: EngagementAction,
  deviceId: string
): Promise<EngagementReadResult & { counts: Record<string, EngagementCounts> }> {
  return runExclusive(async () => {
    const current = getState();
    const base = getBaseline();
    const day = shanghaiDayKey();

    applyAction(current, action, modId, deviceId, day);
    pruneViewDays(current, day, VIEW_DAY_KEEP);

    try {
      await persist(current);
      mirrorToCos(current);
    } catch (error) {
      logger.error("[engagement] 计数落盘失败（内存已更新，重启后会丢这一步）", {
        modId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      counts: { [modId]: computeCounts(current, base, modId) },
      mine: { [modId]: computeMine(current, modId, deviceId) },
    };
  });
}

/** 这台设备收藏过的 MOD id（最近收藏在前），供「我的收藏」页使用 */
export function readFavoritedIds(deviceId: string): string[] {
  return listFavoritedIds(getState(), deviceId);
}

/** 供运维/排查用：当前落盘路径与内存里的条目数 */
export function describeStore() {
  const current = getState();
  return {
    statePath: STATE_PATH,
    baselinePath: BASELINE_PATH,
    trackedMods: Object.keys(current.mods).length,
    baselineMods: Object.keys(getBaseline()).length,
  };
}
