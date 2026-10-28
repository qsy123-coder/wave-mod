import { describe, expect, it } from "vitest";

import { buildVisitRange, chartMax, shiftDay, summarizeVisits } from "./aggregate";
import type { VisitRow } from "./types";

const row = (date: string, uv: number, pv: number): VisitRow => ({ date, uv, pv });

describe("shiftDay", () => {
  it("跨月、跨年都按日历日平移", () => {
    expect(shiftDay("2026-10-28", -1)).toBe("2026-10-27");
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("平方差不会因为时区把日期挪掉一天", () => {
    expect(shiftDay("2026-10-28", 0)).toBe("2026-10-28");
  });

  it("非法输入原样返回，不抛错", () => {
    expect(shiftDay("not-a-date", -1)).toBe("not-a-date");
  });
});

describe("buildVisitRange", () => {
  it("铺满区间并在缺失日期补 0", () => {
    const days = buildVisitRange(
      [row("2026-10-24", 5, 9), row("2026-10-26", 2, 3), row("2026-10-28", 7, 11)],
      4,
      "2026-10-28",
    );

    expect(days).toEqual([
      row("2026-10-25", 0, 0),
      row("2026-10-26", 2, 3),
      row("2026-10-27", 0, 0),
      row("2026-10-28", 7, 11),
    ]);
  });

  it("区间外的数据被丢弃（服务端多给了也不影响）", () => {
    const days = buildVisitRange([row("2026-09-01", 100, 200)], 3, "2026-10-28");

    expect(days.map((item) => item.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(days.every((item) => item.uv === 0)).toBe(true);
  });
});

describe("summarizeVisits", () => {
  const days = buildVisitRange(
    [row("2026-10-27", 10, 20), row("2026-10-28", 14, 18)],
    3,
    "2026-10-28",
  );

  it("给出今天/昨天与环比差值", () => {
    const summary = summarizeVisits(days, "2026-10-28");

    expect(summary.today).toEqual(row("2026-10-28", 14, 18));
    expect(summary.yesterday).toEqual(row("2026-10-27", 10, 20));
    expect(summary.uvDelta).toBe(4);
    expect(summary.pvDelta).toBe(-2);
  });

  it("昨日为 0 时环比是 null（涨幅无意义）", () => {
    const summary = summarizeVisits(buildVisitRange([row("2026-10-28", 3, 4)], 2, "2026-10-28"), "2026-10-28");

    expect(summary.uvDelta).toBeNull();
    expect(summary.pvDelta).toBeNull();
  });
});

describe("chartMax", () => {
  it("全 0 时返回 1，避免除零", () => {
    expect(chartMax(buildVisitRange([], 3, "2026-10-28"), (item) => Math.max(item.uv, item.pv))).toBe(1);
  });

  it("留出约 10% 的顶部余量", () => {
    expect(chartMax([row("2026-10-28", 100, 50)], (item) => item.uv)).toBe(110);
    expect(chartMax([row("2026-10-28", 3, 50)], (item) => item.pv)).toBe(55);
  });
});
