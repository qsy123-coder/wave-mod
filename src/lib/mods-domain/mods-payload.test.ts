import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import {
  MODS_PAYLOAD_MAX_CHARS,
  decodeModsPayload,
  encodeModsPayload,
} from "@/lib/mods-domain/mods-payload-codec";
import type { ModRow, SiteMod } from "@/lib/mods-domain/types";

/** Next.js Data Cache 单项上限。 */
const DATA_CACHE_ITEM_LIMIT = 2 * 1024 * 1024;

function loadSnapshotRows(): Record<string, unknown>[] {
  const gz = readFileSync("data/mods-snapshot.json.gz");
  return JSON.parse(gunzipSync(gz).toString("utf8")) as Record<string, unknown>[];
}

describe("mods payload 编解码", () => {
  it("encode → decode 原样还原（含中文与嵌套结构）", () => {
    const mods = [{ id: "a", title: "千咲-泳装", tags: ["x", "y"], nested: { n: 1 } }];
    expect(decodeModsPayload<typeof mods[number]>(encodeModsPayload(mods))).toEqual(mods);
  });

  it("空数组合法（某个分站一条都没有时不该抛）", () => {
    expect(decodeModsPayload(encodeModsPayload([]))).toEqual([]);
  });

  it("内容损坏时抛错，不静默返回空数组", () => {
    expect(() => decodeModsPayload("not-a-payload")).toThrow(/解码失败/);
  });

  it("根节点不是数组时抛错", () => {
    expect(() => decodeModsPayload(encodeModsPayload({ a: 1 } as unknown as unknown[]))).toThrow(/不是数组/);
  });
});

/**
 * 守护 getCachedModsPayload 的整表体积。
 *
 * 这条护栏存在的原因：Data Cache 对**单条缓存项**有 2MB 上限，超限时不是报错而是
 * **静默跳过写入** —— 缓存等于没做，而且没有任何日志。整表体积会随行数增长，
 * 属于「很容易悄悄越界」的改动，因此把量算固化成用例。
 *
 * 量算用的是打包快照而不是线上库：离线、稳定。快照覆盖**全部** game_key，
 * 比单站真实 payload 更大，属于偏保守的估计。
 */
describe("getCachedModsPayload 的整表体积", () => {
  const rows = loadSnapshotRows();

  it("快照行覆盖 publicModColumns 的全部列", () => {
    const columns = Array.from(new Set(publicModColumns.split(",").map((c) => c.trim()).filter(Boolean)));

    // 某一列在所有行里都缺席 ⇒ 快照是裁剪过的，不能代表线上行，体积量算失真
    const missingEverywhere = columns.filter((column) => rows.every((row) => !(column in row)));

    expect(missingEverywhere).toEqual([]);
  });

  it("整表 gzip+base64 后低于安全上限，且离 2MB 硬上限留有一倍余量", () => {
    const mods: SiteMod[] = rows.map((row) => mapMod(row as ModRow));
    const payload = encodeModsPayload(mods);

    expect(payload.length).toBeLessThan(MODS_PAYLOAD_MAX_CHARS);
    expect(payload.length * 2).toBeLessThan(DATA_CACHE_ITEM_LIMIT);
  });
});
