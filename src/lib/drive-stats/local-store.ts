import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "@/lib/logger";

import type { DrivePlatformRow } from "./types";

/**
 * 网盘点击统计的**本地文件**实现（`npm run dev`、CI 用）。
 *
 * 语义与 `deploy/hk-engagement/service.py` 的 driveClicks 段保持一致：
 *   - 今天 / 昨天保留设备 hash 列表（实时去重，接得住跨零点的迟到请求）
 *   - 前天及更早冻结成整数，丢掉列表
 *   - 同设备同天同平台只计 1 次，不区分 mod
 *
 * 设备号同样先 sha256 截断再落盘，本地盘上也不留可直接反查的标识。
 */

const STATE_PATH =
  process.env.DRIVE_CLICKS_STATE_PATH?.trim() ||
  join(process.env.ENGAGEMENT_STORE_DIR?.trim() || join(process.cwd(), "data", "runtime"), "drive-clicks.json");

/** 数组 = 今天/昨天（可去重）；数字 = 已冻结的历史日 */
type DayEntry = string[] | number;
type PlatformEntry = { total: number; days: Record<string, DayEntry> };
type DriveClicksState = { version: 1; platforms: Record<string, PlatformEntry> };

let state: DriveClicksState | null = null;
let loadedMtimeMs = -1;
let writeChain: Promise<unknown> = Promise.resolve();

function emptyState(): DriveClicksState {
  return { version: 1, platforms: {} };
}

function toCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function parseState(raw: unknown): DriveClicksState {
  const parsed = emptyState();
  if (typeof raw !== "object" || raw === null) return parsed;

  const platforms = (raw as { platforms?: unknown }).platforms;
  if (typeof platforms !== "object" || platforms === null) return parsed;

  for (const [platform, value] of Object.entries(platforms as Record<string, unknown>)) {
    const name = platform.trim();
    if (!name || typeof value !== "object" || value === null) continue;

    const entry = value as { total?: unknown; days?: unknown };
    const days: Record<string, DayEntry> = {};

    if (typeof entry.days === "object" && entry.days !== null) {
      for (const [date, dayValue] of Object.entries(entry.days as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (Array.isArray(dayValue)) {
          // 列表长度就是 UV：重复项会让统计凭空变大，读取时先保序去重
          days[date] = [
            ...new Set(dayValue.filter((item): item is string => typeof item === "string" && item.length > 0)),
          ];
        } else {
          days[date] = toCount(dayValue);
        }
      }
    }

    parsed.platforms[name] = { total: toCount(entry.total), days };
  }

  return parsed;
}

function fileMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}

function getState(): DriveClicksState {
  const mtime = fileMtimeMs(STATE_PATH);
  if (state && mtime === loadedMtimeMs) return state;

  try {
    state = parseState(existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : null);
  } catch (error) {
    // 文件坏了不要清空：静默归零比崩溃更难查
    logger.warn("[drive-stats] 本地网盘点击文件读取失败，本次以空状态继续", {
      path: STATE_PATH,
      error: error instanceof Error ? error.message : String(error),
    });
    state = emptyState();
  }

  loadedMtimeMs = mtime;
  return state;
}

async function persist(next: DriveClicksState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const tmpPath = `${STATE_PATH}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(next), "utf8");
  await rename(tmpPath, STATE_PATH);
  loadedMtimeMs = fileMtimeMs(STATE_PATH);
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task, task);
  writeChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function hashDevice(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex").slice(0, 16);
}

function shiftDayKey(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + delta * 86_400_000).toISOString().slice(0, 10);
}

/** 今天和昨天保留列表，更早的冻结（与 HK 服务同一条规则） */
function freeze(current: DriveClicksState, today: string): void {
  const yesterday = shiftDayKey(today, -1);

  for (const entry of Object.values(current.platforms)) {
    for (const [date, value] of Object.entries(entry.days)) {
      if (date === today || date === yesterday) continue;
      if (!Array.isArray(value)) continue;

      entry.days[date] = value.length;
    }
  }
}

export async function localRecordDriveClick(
  platform: string,
  deviceId: string,
  today: string,
): Promise<void> {
  await runExclusive(async () => {
    const current = getState();
    const entry = (current.platforms[platform] ??= { total: 0, days: {} });
    const digest = hashDevice(deviceId);
    const value = entry.days[today];
    let counted = false;

    if (Array.isArray(value)) {
      if (!value.includes(digest)) {
        value.push(digest);
        counted = true;
      }
    } else if (typeof value === "number") {
      // 已冻结的历史日：没法再按设备去重，只能当一次新点击（迟到请求极少见）
      entry.days[today] = value + 1;
      counted = true;
    } else {
      entry.days[today] = [digest];
      counted = true;
    }

    if (counted) entry.total += 1;

    freeze(current, today);

    try {
      await persist(current);
    } catch (error) {
      logger.error("[drive-stats] 本地网盘点击落盘失败（内存已更新）", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function localReadDrivePlatforms(days: number, today: string): DrivePlatformRow[] {
  const current = getState();
  const start = shiftDayKey(today, -(Math.max(1, Math.trunc(days)) - 1));

  return Object.entries(current.platforms)
    .map(([platform, entry]) => ({
      platform,
      total: toCount(entry.total),
      days: Object.entries(entry.days)
        .filter(([date]) => date >= start && date <= today)
        .map(([date, value]) => ({
          date,
          count: Array.isArray(value) ? value.length : toCount(value),
        }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    }))
    .filter((row) => row.total > 0 || row.days.length > 0)
    .sort((a, b) => b.total - a.total || a.platform.localeCompare(b.platform, "zh-CN"));
}
