import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "@/lib/logger";

import type { VisitRow } from "./types";

/**
 * 访问统计的**本地文件**实现（`npm run dev`、CI 用）。
 *
 * 语义与 `deploy/hk-engagement/service.py` 的 visits 段保持一致：
 *   - 当天 / 昨天保留设备 hash 列表（实时算 UV，接得住跨零点的迟到请求）
 *   - 前天及更早冻结成 `{pv, uv}`，丢掉列表
 *
 * 设备号同样先 sha256 截断再落盘，本地盘上也不留可直接反查的标识。
 */

const STATE_PATH =
  process.env.VISITS_STATE_PATH?.trim() ||
  join(process.env.ENGAGEMENT_STORE_DIR?.trim() || join(process.cwd(), "data", "runtime"), "visits.json");

type DayEntry = { pv: number; devices?: string[]; uv?: number };
type VisitsState = { version: 1; days: Record<string, DayEntry> };

let state: VisitsState | null = null;
let loadedMtimeMs = -1;
let writeChain: Promise<unknown> = Promise.resolve();

function emptyState(): VisitsState {
  return { version: 1, days: {} };
}

function toCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function parseState(raw: unknown): VisitsState {
  const parsed = emptyState();
  if (typeof raw !== "object" || raw === null) return parsed;

  const days = (raw as { days?: unknown }).days;
  if (typeof days !== "object" || days === null) return parsed;

  for (const [date, value] of Object.entries(days as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (typeof value !== "object" || value === null) continue;

    const entry = value as { pv?: unknown; devices?: unknown; uv?: unknown };
    const pv = toCount(entry.pv);
    if (Array.isArray(entry.devices)) {
      parsed.days[date] = {
        pv,
        devices: entry.devices.filter((item): item is string => typeof item === "string" && item.length > 0),
      };
    } else {
      parsed.days[date] = { pv, uv: toCount(entry.uv) };
    }
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

function getState(): VisitsState {
  const mtime = fileMtimeMs(STATE_PATH);
  if (state && mtime === loadedMtimeMs) return state;

  try {
    state = parseState(existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : null);
  } catch (error) {
    // 文件坏了不要清空：静默归零比崩溃更难查
    logger.warn("[visits] 本地访问统计文件读取失败，本次以空状态继续", {
      path: STATE_PATH,
      error: error instanceof Error ? error.message : String(error),
    });
    state = emptyState();
  }

  loadedMtimeMs = mtime;
  return state;
}

async function persist(next: VisitsState): Promise<void> {
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
    () => undefined
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

/** 今天和昨天保留设备列表，更早的冻结（与 HK 服务同一条规则） */
function freeze(current: VisitsState, today: string): void {
  const yesterday = shiftDayKey(today, -1);

  for (const [date, entry] of Object.entries(current.days)) {
    if (date === today || date === yesterday) continue;
    if (!Array.isArray(entry.devices)) continue;

    entry.uv = entry.devices.length;
    delete entry.devices;
  }
}

export async function localRecordVisit(deviceId: string, today: string): Promise<void> {
  await runExclusive(async () => {
    const current = getState();
    const entry = (current.days[today] ??= { pv: 0, devices: [] });

    entry.pv += 1;
    if (!Array.isArray(entry.devices)) entry.devices = [];

    const digest = hashDevice(deviceId);
    if (!entry.devices.includes(digest)) entry.devices.push(digest);

    freeze(current, today);

    try {
      await persist(current);
    } catch (error) {
      logger.error("[visits] 本地访问统计落盘失败（内存已更新）", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function localReadVisitDays(days: number, today: string): VisitRow[] {
  const current = getState();
  const start = shiftDayKey(today, -(Math.max(1, Math.trunc(days)) - 1));

  return Object.entries(current.days)
    .filter(([date]) => date >= start && date <= today)
    .map(([date, entry]) => ({
      date,
      uv: Array.isArray(entry.devices) ? entry.devices.length : toCount(entry.uv),
      pv: toCount(entry.pv),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
