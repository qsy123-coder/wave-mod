import { describe, expect, it } from "vitest";

import {
  checkSnapshotFreshness,
  snapshotStats,
  SNAPSHOT_TIME_DRIFT_MS,
} from "./snapshot-freshness.mjs";

const HOUR = 3600000;

/** 造一个「库里 1000 条已发布，最新一条在 t0」的基准 */
const DB = { count: 1000, maxCreatedAt: Date.parse("2026-09-21T03:00:00Z") };

describe("checkSnapshotFreshness", () => {
  it("行数与时间戳都一致时通过", () => {
    expect(checkSnapshotFreshness(DB, DB)).toEqual({ ok: true });
  });

  it("快照冻结（少 24 条、旧一整天）判失败，并在原因里点出行数", () => {
    const verdict = checkSnapshotFreshness(
      { count: 976, maxCreatedAt: DB.maxCreatedAt - 24 * HOUR },
      DB,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("行数对不上");
    expect(verdict.reason).toContain("976");
    expect(verdict.reason).toContain("1000");
  });

  it("容忍两次查询之间的并发写入窗口（少 1 条、时间差 30 分钟）", () => {
    const verdict = checkSnapshotFreshness(
      { count: 999, maxCreatedAt: DB.maxCreatedAt - 30 * 60 * 1000 },
      DB,
    );
    expect(verdict).toEqual({ ok: true });
  });

  it("行数一致但快照明显更旧时仍然失败（行数巧合相同的护栏）", () => {
    const verdict = checkSnapshotFreshness(
      { count: DB.count, maxCreatedAt: DB.maxCreatedAt - 25 * HOUR },
      DB,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("最新记录比库内旧");
  });

  it("行数漂移在 1% 内通过、超出即失败", () => {
    const at = DB.maxCreatedAt;
    expect(checkSnapshotFreshness({ count: 1010, maxCreatedAt: at }, DB)).toEqual({ ok: true });
    expect(checkSnapshotFreshness({ count: 990, maxCreatedAt: at }, DB)).toEqual({ ok: true });
    expect(checkSnapshotFreshness({ count: 1011, maxCreatedAt: at }, DB).ok).toBe(false);
  });

  it("快照比库多也走同一个容忍度（并发下架的情况）", () => {
    expect(checkSnapshotFreshness({ count: 1005, maxCreatedAt: DB.maxCreatedAt }, DB)).toEqual({
      ok: true,
    });
  });

  it("库里已发布为 0 条时判失败，不把不可信的基准当通过", () => {
    const verdict = checkSnapshotFreshness(
      { count: 0, maxCreatedAt: null },
      { count: 0, maxCreatedAt: null },
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("基准不可信");
  });

  it("快照清空（0 条）而库里有数据时判失败", () => {
    const verdict = checkSnapshotFreshness({ count: 0, maxCreatedAt: null }, DB);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("行数对不上");
  });

  it("时间戳缺失时判失败，而不是当成一致", () => {
    const verdict = checkSnapshotFreshness({ count: DB.count, maxCreatedAt: null }, DB);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("无法比对最新时间戳");
  });

  it("时间漂移的容忍边界是 SNAPSHOT_TIME_DRIFT_MS", () => {
    const at = (drift) =>
      checkSnapshotFreshness({ count: DB.count, maxCreatedAt: DB.maxCreatedAt - drift }, DB);
    expect(at(SNAPSHOT_TIME_DRIFT_MS).ok).toBe(true);
    expect(at(SNAPSHOT_TIME_DRIFT_MS + 1).ok).toBe(false);
  });
});

describe("snapshotStats", () => {
  it("取行数与最大的 created_at", () => {
    expect(
      snapshotStats([
        { created_at: "2026-09-20T10:00:00.000Z" },
        { created_at: "2026-09-21T02:00:00.000Z" },
        { created_at: "2026-09-19T23:00:00.000Z" },
      ]),
    ).toEqual({ count: 3, maxCreatedAt: Date.parse("2026-09-21T02:00:00.000Z") });
  });

  it("跳过 created_at 缺失或不可解析的行，不让坏数据把结果带偏", () => {
    expect(
      snapshotStats([
        { created_at: "2026-09-21T02:00:00.000Z" },
        { created_at: null },
        { created_at: "不是时间" },
        {},
        null,
      ]),
    ).toEqual({ count: 5, maxCreatedAt: Date.parse("2026-09-21T02:00:00.000Z") });
  });

  it("空数组返回 count 0 与 null 时间戳", () => {
    expect(snapshotStats([])).toEqual({ count: 0, maxCreatedAt: null });
  });

  it("全是坏行时时间戳为 null，但行数照数", () => {
    expect(snapshotStats([{ created_at: null }, {}])).toEqual({ count: 2, maxCreatedAt: null });
  });
});
