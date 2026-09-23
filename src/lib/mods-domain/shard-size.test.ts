import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Data Cache 在测试进程里不存在；本用例只量序列化体积，不依赖缓存语义。
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import { MOD_FETCH_BATCH_SIZE } from "@/lib/mods-domain/public";
import type { ModRow } from "@/lib/mods-domain/types";

/**
 * 守护 getCachedModShard 的分片体积。
 *
 * 这条护栏存在的原因：Next.js Data Cache 对**单条缓存项**有 2MB 上限，超限时
 * 不是报错而是**静默跳过写入** —— 缓存等于没做，而且没有任何日志。2026-09-23
 * 把 mapMod 下沉进缓存后，缓存内容从原始行变成领域对象、体积放大 1.3x，
 * 属于「很容易悄悄越界」的改动，因此把量算固化成用例。
 *
 * 量算用的是打包快照而不是线上库：离线、稳定、且快照行完整覆盖 publicModColumns
 * （下面第一条用例就在守这一点，它红了说明快照不再能代表真实行、第二条的数字也就不可信了）。
 */

/** Next.js Data Cache 单项上限。 */
const DATA_CACHE_ITEM_LIMIT = 2 * 1024 * 1024;

/** 安全余量倍数：要求实测体积 ×2 仍在上限内，避免贴边运行。 */
const SAFETY_FACTOR = 2;

function loadSnapshotRows(): Record<string, unknown>[] {
  const gz = readFileSync("data/mods-snapshot.json.gz");
  return JSON.parse(gunzipSync(gz).toString("utf8")) as Record<string, unknown>[];
}

describe("getCachedModShard 的分片体积", () => {
  const rows = loadSnapshotRows();

  it("快照行覆盖 publicModColumns 的全部列", () => {
    const columns = Array.from(new Set(publicModColumns.split(",").map((c) => c.trim()).filter(Boolean)));

    // 某一列在所有行里都缺席 ⇒ 快照是裁剪过的，不能代表线上行，体积量算失真
    const missingEverywhere = columns.filter((column) => rows.every((row) => !(column in row)));

    expect(missingEverywhere).toEqual([]);
  });

  it(`${MOD_FETCH_BATCH_SIZE} 行映射后的 JSON 体积在上限内且留有余量`, () => {
    expect(rows.length).toBeGreaterThanOrEqual(MOD_FETCH_BATCH_SIZE);

    const batch = rows.slice(0, MOD_FETCH_BATCH_SIZE).map((row) => mapMod(row as ModRow));
    const bytes = JSON.stringify(batch).length;

    expect(bytes * SAFETY_FACTOR).toBeLessThan(DATA_CACHE_ITEM_LIMIT);
  });
});
