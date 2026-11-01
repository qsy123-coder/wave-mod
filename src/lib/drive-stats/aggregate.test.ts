import { describe, expect, it } from "vitest";

import { buildDriveStats, shiftDriveDay } from "./aggregate";
import type { DrivePlatformRow } from "./types";

const row = (
  platform: string,
  total: number,
  days: Array<{ date: string; count: number }>,
): DrivePlatformRow => ({ platform, total, days });

describe("shiftDriveDay", () => {
  it("跨月、跨年都按日历日平移", () => {
    expect(shiftDriveDay("2026-10-28", -1)).toBe("2026-10-27");
    expect(shiftDriveDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDriveDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDriveDay("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("非法输入原样返回，不抛错", () => {
    expect(shiftDriveDay("not-a-date", -1)).toBe("not-a-date");
  });
});

describe("buildDriveStats", () => {
  it("补零、取今日/昨日，并按累计点击降序", () => {
    const stats = buildDriveStats(
      [
        row("夸克", 12, [
          { date: "2026-10-26", count: 2 },
          { date: "2026-10-28", count: 4 },
        ]),
        row("迅雷", 30, [
          { date: "2026-10-27", count: 10 },
          { date: "2026-10-28", count: 3 },
        ]),
      ],
      3,
      "2026-10-28",
    );

    expect(stats.total).toBe(42);
    expect(stats.today).toBe(7);
    expect(stats.yesterday).toBe(10);
    expect(stats.platforms.map((item) => item.platform)).toEqual(["迅雷", "夸克"]);

    const quark = stats.platforms.find((item) => item.platform === "夸克")!;
    expect(quark.days).toEqual([
      { date: "2026-10-26", count: 2 },
      { date: "2026-10-27", count: 0 },
      { date: "2026-10-28", count: 4 },
    ]);
    expect(quark.today).toBe(4);
    expect(quark.yesterday).toBe(0);
    expect(quark.share).toBeCloseTo(12 / 42);
  });

  it("区间外的日期被丢弃（服务端多给了也不影响）", () => {
    const stats = buildDriveStats(
      [row("夸克", 100, [{ date: "2026-09-01", count: 100 }])],
      3,
      "2026-10-28",
    );

    const quark = stats.platforms[0];
    expect(quark.days.map((item) => item.date)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
    expect(quark.days.every((item) => item.count === 0)).toBe(true);
    // total 是历史累计值，不受区间裁剪影响
    expect(quark.total).toBe(100);
  });

  it("total 丢失时用每日之和兜底", () => {
    const stats = buildDriveStats(
      [row("迅雷", 0, [{ date: "2026-10-28", count: 5 }])],
      1,
      "2026-10-28",
    );

    expect(stats.platforms[0].total).toBe(5);
  });

  it("总数为 0 时不产生 NaN 占比", () => {
    const stats = buildDriveStats([], 3, "2026-10-28");

    expect(stats.platforms).toEqual([]);
    expect(stats.total).toBe(0);
    expect(Number.isNaN(stats.today)).toBe(false);
  });

  it("累计相同时按今日点击降序", () => {
    const stats = buildDriveStats(
      [
        row("夸克", 10, [{ date: "2026-10-28", count: 1 }]),
        row("迅雷", 10, [{ date: "2026-10-28", count: 6 }]),
      ],
      1,
      "2026-10-28",
    );

    expect(stats.platforms.map((item) => item.platform)).toEqual(["迅雷", "夸克"]);
  });
});
