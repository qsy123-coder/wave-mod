import { describe, expect, it } from "vitest";

import type { GachaRecord, Overview, PoolInsight } from "./types";
import { buildVerdict } from "./verdict";

function record(time: string): GachaRecord {
  return {
    poolType: "1",
    poolName: "角色精准调谐",
    resourceId: 1001,
    qualityLevel: 5,
    resourceType: "role",
    name: "测试角色",
    time,
    order: 0,
  };
}

function poolWith(
  intervals: { pulls: number; lower?: boolean }[],
  featuredAttempts = 0,
  featuredWins = 0,
): PoolInsight {
  return {
    poolType: "1",
    poolName: "角色活动唤取",
    groupLabel: "UP 角色池",
    totalPulls: 100,
    fiveStarCount: intervals.length,
    hardPity: 80,
    currentPity: 0,
    currentPityLowerBound: false,
    intervals: intervals.map((interval, index) => ({
      record: record(`2026-01-0${(index % 9) + 1} 12:00:00`),
      pulls: interval.pulls,
      isLowerBound: interval.lower ?? false,
      isOffRate: false,
    })),
    averagePity: null,
    medianPity: null,
    bestPity: null,
    worstPity: null,
    distribution: [],
    featuredAttempts,
    featuredWins,
    featuredOffRate: 0,
    featuredWinRate: featuredAttempts > 0 ? (featuredWins / featuredAttempts) * 100 : null,
    featuredCycles: [],
    featuredAveragePulls: null,
    featuredMedianPulls: null,
    featuredBestPulls: null,
    featuredWorstPulls: null,
    cumulative: [],
  };
}

function overviewWith(
  intervals: { pulls: number; lower?: boolean }[],
  averagePity: number,
  featuredAttempts = 0,
  featuredWins = 0,
): Overview {
  return {
    totalPulls: 100,
    fiveStarCount: intervals.length,
    fourStarCount: 0,
    fiveStarRate: 5,
    averagePity,
    medianPity: averagePity,
    bestPity: null,
    worstPity: null,
    featuredAttempts,
    featuredWins,
    featuredWinRate: featuredAttempts > 0 ? (featuredWins / featuredAttempts) * 100 : null,
    earliestTime: "2026-01-01 12:00:00",
    latestTime: "2026-02-01 12:00:00",
    pools: [poolWith(intervals, featuredAttempts, featuredWins)],
  };
}

describe("buildVerdict", () => {
  it("完整区间不足 5 个时不下结论", () => {
    const verdict = buildVerdict(overviewWith([{ pulls: 40 }, { pulls: 40 }], 40));

    expect(verdict.tone).toBe("insufficient");
    expect(verdict.detail).toContain("2 个");
  });

  it("首个下界区间不计入样本数", () => {
    const verdict = buildVerdict(
      overviewWith([{ pulls: 40, lower: true }, { pulls: 40 }, { pulls: 40 }], 40),
    );

    expect(verdict.tone).toBe("insufficient");
    expect(verdict.detail).toContain("2 个");
  });

  it("平均明显低于理论期望时判为偏欧", () => {
    const verdict = buildVerdict(
      overviewWith(Array.from({ length: 5 }, () => ({ pulls: 42 })), 42),
    );

    expect(verdict.tone).toBe("lucky");
    expect(verdict.title).toContain("欧");
  });

  it("平均明显高于理论期望时判为偏非", () => {
    const verdict = buildVerdict(
      overviewWith(Array.from({ length: 5 }, () => ({ pulls: 70 })), 70),
    );

    expect(verdict.tone).toBe("unlucky");
    expect(verdict.title).toContain("非");
  });

  it("接近理论期望时判为正常", () => {
    const verdict = buildVerdict(
      overviewWith(Array.from({ length: 5 }, () => ({ pulls: 54 })), 54),
    );

    expect(verdict.tone).toBe("normal");
    expect(verdict.detail).toContain("54.1");
  });

  it("有足够 50/50 样本时带上胜场", () => {
    const verdict = buildVerdict(
      overviewWith(Array.from({ length: 5 }, () => ({ pulls: 54 })), 54, 6, 2),
    );

    expect(verdict.detail).toContain("2/6");
  });

  it("50/50 样本不足时不提胜场", () => {
    const verdict = buildVerdict(
      overviewWith(Array.from({ length: 5 }, () => ({ pulls: 54 })), 54, 2, 1),
    );

    expect(verdict.detail).not.toContain("50/50");
  });
});
