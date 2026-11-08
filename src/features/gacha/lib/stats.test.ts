import { describe, expect, it } from "vitest";

import {
  buildCombinedCostProfile,
  buildCostProfile,
  buildOverview,
  buildPoolInsight,
  buildWeaponCostProfile,
  isOffRateRecord,
} from "./stats";
import type { GachaRecord } from "./types";

function at(day: number): string {
  return `2026-01-${String(day).padStart(2, "0")} 12:00:00`;
}

function record(
  overrides: Partial<GachaRecord> & Pick<GachaRecord, "time">,
): GachaRecord {
  return {
    poolType: "1",
    poolName: "角色精准调谐",
    resourceId: 1001,
    qualityLevel: 3,
    resourceType: "role",
    name: "三星物品",
    order: 0,
    ...overrides,
  };
}

describe("buildPoolInsight", () => {
  it("首个五星区间标「≥」，后续区间为完整值", () => {
    const pool = buildPoolInsight("1", [
      record({ time: at(1) }),
      record({ time: at(2) }),
      record({ time: at(3) }),
      record({ time: at(4), qualityLevel: 5, resourceId: 1001, name: "五星角色" }),
      record({ time: at(5) }),
      record({ time: at(6) }),
      record({ time: at(7), qualityLevel: 5, resourceId: 1001, name: "五星角色" }),
    ]);

    expect(pool.totalPulls).toBe(7);
    expect(pool.fiveStarCount).toBe(2);
    expect(pool.intervals[0]).toMatchObject({ pulls: 4, isLowerBound: true });
    expect(pool.intervals[1]).toMatchObject({ pulls: 3, isLowerBound: false });
    // 平均/中位只用完整区间
    expect(pool.averagePity).toBe(3);
    expect(pool.medianPity).toBe(3);
    expect(pool.currentPity).toBe(0);
  });

  it("当前垫抽 = 最后一条五星之后的抽数", () => {
    const pool = buildPoolInsight("1", [
      record({ time: at(1), qualityLevel: 5, resourceId: 1001 }),
      record({ time: at(2) }),
      record({ time: at(3) }),
    ]);

    expect(pool.currentPity).toBe(2);
    expect(pool.currentPityLowerBound).toBe(false);
  });

  it("没有五星时当前垫抽等于总抽数并标下界", () => {
    const pool = buildPoolInsight("1", [record({ time: at(1) }), record({ time: at(2) })]);

    expect(pool.currentPity).toBe(2);
    expect(pool.currentPityLowerBound).toBe(true);
  });

  it("十连同时间戳按接口下标倒序还原抽取顺序", () => {
    // 接口新→旧：order 0 是后抽到的那一条
    const pool = buildPoolInsight("1", [
      record({ time: at(1), order: 0, qualityLevel: 5, resourceId: 1001 }),
      record({ time: at(1), order: 1 }),
    ]);

    expect(pool.intervals[0].pulls).toBe(2);
  });

  it("歪只在限定角色池成立", () => {
    const standard = record({ time: at(1), qualityLevel: 5, resourceId: 1104, name: "维里奈" });

    expect(isOffRateRecord(standard, "1")).toBe(true);
    expect(isOffRateRecord(standard, "8")).toBe(true);
    expect(isOffRateRecord(standard, "3")).toBe(false);
    expect(isOffRateRecord(standard, "2")).toBe(false);
  });

  it("大保底那一发不计入 50/50 分母", () => {
    const pool = buildPoolInsight("1", [
      // 歪
      record({ time: at(1), qualityLevel: 5, resourceId: 1104, name: "维里奈" }),
      // 大保底 UP：不算 50/50
      record({ time: at(2), qualityLevel: 5, resourceId: 1001, name: "UP 角色" }),
      // 重新 50/50：赢了
      record({ time: at(3), qualityLevel: 5, resourceId: 1001, name: "UP 角色" }),
    ]);

    expect(pool.featuredAttempts).toBe(2);
    expect(pool.featuredWins).toBe(1);
    expect(pool.featuredOffRate).toBe(1);
    expect(pool.featuredWinRate).toBe(50);
  });

  it("UP 周期成本包含前置歪", () => {
    const pool = buildPoolInsight("1", [
      record({ time: at(1) }),
      record({ time: at(2), qualityLevel: 5, resourceId: 1104, name: "维里奈" }),
      record({ time: at(3), qualityLevel: 5, resourceId: 1001, name: "UP 角色" }),
      record({ time: at(4) }),
      record({ time: at(5), qualityLevel: 5, resourceId: 1001, name: "UP 角色" }),
    ]);

    expect(pool.featuredCycles).toHaveLength(2);
    expect(pool.featuredCycles[0]).toMatchObject({ pulls: 3, isLowerBound: true });
    expect(pool.featuredCycles[0].offRateRecords).toHaveLength(1);
    expect(pool.featuredCycles[1]).toMatchObject({ pulls: 2, isLowerBound: false });
    // 平均只用完整周期
    expect(pool.featuredAveragePulls).toBe(2);
  });

  it("直方图按 10 抽分箱且合计等于完整区间数", () => {
    const pool = buildPoolInsight("1", [
      record({ time: at(1), qualityLevel: 5, resourceId: 1001 }),
      record({ time: at(2), qualityLevel: 5, resourceId: 1001 }),
      record({ time: at(3), qualityLevel: 5, resourceId: 1001 }),
    ]);

    // 第一个区间（1 抽）是下界，不进分布；后两个是完整区间
    expect(pool.distribution.reduce((sum, bin) => sum + bin.count, 0)).toBe(2);
    expect(pool.distribution[0]).toMatchObject({ start: 1, end: 10, count: 2 });
  });

  it("累计出金率终点为 100%", () => {
    const pool = buildPoolInsight("1", [
      record({ time: at(1), qualityLevel: 5, resourceId: 1001 }),
      record({ time: at(2) }),
      record({ time: at(3) }),
      record({ time: at(4), qualityLevel: 5, resourceId: 1001 }),
    ]);

    const last = pool.cumulative.at(-1);
    expect(last?.percentage).toBe(100);
  });
});

describe("buildOverview", () => {
  it("跨池汇总，但每个池的垫抽互不影响", () => {
    const overview = buildOverview([
      record({ time: at(1), poolType: "1", qualityLevel: 5, resourceId: 1001 }),
      record({ time: at(2), poolType: "1" }),
      record({ time: at(3), poolType: "2", poolName: "武器精准调谐", resourceType: "weapon" }),
    ]);

    expect(overview.totalPulls).toBe(3);
    expect(overview.fiveStarCount).toBe(1);
    expect(overview.fiveStarRate).toBeCloseTo(33.33, 1);

    const rolePool = overview.pools.find((pool) => pool.poolType === "1");
    const weaponPool = overview.pools.find((pool) => pool.poolType === "2");
    expect(rolePool?.currentPity).toBe(1);
    expect(weaponPool?.currentPity).toBe(1);
  });

  it("按官方池序展示", () => {
    const overview = buildOverview([
      record({ time: at(1), poolType: "3" }),
      record({ time: at(2), poolType: "1" }),
    ]);

    expect(overview.pools.map((pool) => pool.poolType)).toEqual(["1", "3"]);
  });
});

describe("buildCostProfile", () => {  it("成本包含前置歪，并按同名目标分段", () => {
    const records = [
      record({ time: at(1) }),
      record({ time: at(2), qualityLevel: 5, resourceId: 1104, name: "维里奈" }),
      record({ time: at(3), qualityLevel: 5, resourceId: 1001, name: "UP 角色" }),
      record({ time: at(4) }),
      record({ time: at(5) }),
      record({ time: at(6) }),
      record({ time: at(7), qualityLevel: 5, resourceId: 1001, name: "UP 角色" }),
    ];

    const profile = buildCostProfile("1", records, 1001);

    expect(profile).not.toBeNull();
    expect(profile?.acquisitions).toHaveLength(2);
    expect(profile?.acquisitions[0]).toMatchObject({
      pulls: 1,
      costPulls: 3,
      offRateBefore: 1,
      isLowerBound: true,
    });
    expect(profile?.acquisitions[1]).toMatchObject({
      pulls: 4,
      costPulls: 4,
      offRateBefore: 0,
      isLowerBound: false,
    });
    expect(profile?.totalPulls).toBe(7);
    expect(profile?.averagePulls).toBe(3.5);
    expect(profile?.bestPulls).toBe(3);
    expect(profile?.worstPulls).toBe(4);
  });

  it("没有获取过该目标时返回 null", () => {
    expect(buildCostProfile("1", [record({ time: at(1) })], 9999)).toBeNull();
  });

  it("中间隔着别的 UP 时，本次成本只算自己的 UP 周期", () => {
    const profile = buildCostProfile(
      "1",
      [
        record({ time: at(1), qualityLevel: 5, resourceId: 1001, name: "A" }),
        record({ time: at(2) }),
        record({ time: at(3) }),
        record({ time: at(4), qualityLevel: 5, resourceId: 2002, name: "B" }),
        record({ time: at(5) }),
        record({ time: at(6), qualityLevel: 5, resourceId: 1001, name: "A" }),
      ],
      1001,
    );

    expect(profile?.acquisitions).toHaveLength(2);
    expect(profile?.acquisitions[0]).toMatchObject({ pulls: 1, costPulls: 1 });
    // 旧实现会算成 6（距上次同名角色），正确值是 2（距上一个 UP）
    expect(profile?.acquisitions[1]).toMatchObject({ pulls: 2, costPulls: 2 });
    expect(profile?.totalPulls).toBe(3);
  });

  it("前置歪只计入紧接着的那个 UP", () => {
    const profile = buildCostProfile(
      "1",
      [
        record({ time: at(1), qualityLevel: 5, resourceId: 1001, name: "A" }),
        record({ time: at(2), qualityLevel: 5, resourceId: 2002, name: "B" }),
        record({ time: at(3), qualityLevel: 5, resourceId: 1104, name: "维里奈" }),
        record({ time: at(4), qualityLevel: 5, resourceId: 1001, name: "A" }),
      ],
      1001,
    );

    expect(profile?.acquisitions[0]).toMatchObject({ costPulls: 1, offRateBefore: 0 });
    expect(profile?.acquisitions[1]).toMatchObject({ costPulls: 2, offRateBefore: 1 });
    expect(profile?.totalPulls).toBe(3);
  });

  it("在限定池点歪出来的常驻五星也能看到自己的区间", () => {
    const profile = buildCostProfile(
      "1",
      [
        record({ time: at(1), qualityLevel: 5, resourceId: 1104, name: "维里奈" }),
        record({ time: at(2), qualityLevel: 5, resourceId: 1001, name: "A" }),
      ],
      1104,
    );

    expect(profile?.acquisitions).toHaveLength(1);
    expect(profile?.totalPulls).toBe(1);
  });
});

describe("角色 ↔ 专武合并", () => {
  // 1105 折枝 → 21050026（来自资源包 catalog）
  const ROLE_ID = 1105;
  const WEAPON_ID = 21050026;

  function records() {
    return [
      // 角色池：2 抽拿到折枝
      record({ time: at(1) }),
      record({ time: at(2), poolType: "1", qualityLevel: 5, resourceId: ROLE_ID, name: "折枝" }),
      // 武器池 2：2 抽拿到专武
      record({
        time: at(3),
        poolType: "2",
        poolName: "武器精准调谐",
        resourceType: "weapon",
      }),
      record({
        time: at(4),
        poolType: "2",
        poolName: "武器精准调谐",
        qualityLevel: 5,
        resourceType: "weapon",
        resourceId: WEAPON_ID,
        name: "琼枝冰绡",
      }),
      // 武器池 9：又抽到一次专武，1 抽
      record({
        time: at(5),
        poolType: "9",
        poolName: "武器新旅调谐",
        qualityLevel: 5,
        resourceType: "weapon",
        resourceId: WEAPON_ID,
        name: "琼枝冰绡",
      }),
      // 常驻武器池 4 的同一把武器不算进专武成本（专武只统计 2/9/11）
      record({
        time: at(6),
        poolType: "4",
        poolName: "武器常驻调谐",
        qualityLevel: 5,
        resourceType: "weapon",
        resourceId: WEAPON_ID,
        name: "琼枝冰绡",
      }),
    ];
  }

  it("专武跨 2/9/11 汇总，忽略常驻武器池", () => {
    const weapon = buildWeaponCostProfile(records(), WEAPON_ID);

    expect(weapon?.acquisitions).toHaveLength(2);
    expect(weapon?.totalPulls).toBe(3);
    expect(weapon?.averagePulls).toBe(1.5);
    expect(weapon?.bestPulls).toBe(1);
    expect(weapon?.worstPulls).toBe(2);
    expect(weapon?.isLowerBound).toBe(true);
  });

  it("角色与专武成本相加", () => {
    const combined = buildCombinedCostProfile(records(), "1", ROLE_ID);

    expect(combined.signatureWeaponId).toBe(WEAPON_ID);
    expect(combined.weaponName).toBe("琼枝冰绡");
    expect(combined.role?.totalPulls).toBe(2);
    expect(combined.weapon?.totalPulls).toBe(3);
    expect(combined.totalPulls).toBe(5);
    expect(combined.totalCount).toBe(3);
    expect(combined.averagePulls).toBeCloseTo(5 / 3, 6);
    expect(combined.isLowerBound).toBe(true);
  });

  it("有专武映射但没抽到专武时，合计只算角色", () => {
    const combined = buildCombinedCostProfile(
      [
        record({ time: at(1) }),
        record({ time: at(2), qualityLevel: 5, resourceId: ROLE_ID, name: "折枝" }),
      ],
      "1",
      ROLE_ID,
    );

    expect(combined.signatureWeaponId).toBe(WEAPON_ID);
    expect(combined.weapon).toBeNull();
    expect(combined.totalPulls).toBe(combined.role?.totalPulls);
    expect(combined.totalCount).toBe(1);
  });

  it("没有专武映射的角色只有角色成本", () => {
    const combined = buildCombinedCostProfile(
      [record({ time: at(1), qualityLevel: 5, resourceId: 999999, name: "无专武角色" })],
      "1",
      999999,
    );

    expect(combined.signatureWeaponId).toBeNull();
    expect(combined.weapon).toBeNull();
    expect(combined.totalPulls).toBe(1);
  });
});
