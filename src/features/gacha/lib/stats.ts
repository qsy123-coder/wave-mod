/**
 * 抽卡统计核心。
 *
 * 口径移植自 juliy819/wuwa-gacha-tool（Apache-2.0）的
 * `src-tauri/src/gacha/parser.rs`，关键规则：
 *   - 垫抽按池独立，绝不跨池累计
 *   - 五星区间含本次出金那一抽
 *   - 官方历史被截断时，首个区间标「≥」
 *   - 限定角色池才统计 50/50，大保底那一发不计入分母
 *   - UP 周期成本包含前置歪
 */

import {
  LIMITED_CHAR_POOL_IDS,
  STANDARD_FIVE_STAR_ROLE_IDS,
  STANDARD_FIVE_STAR_WEAPON_IDS,
  getPoolDisplayName,
  getPoolGroupLabel,
  hardPityForPool,
} from "./pools";
import type {
  Acquisition,
  CostProfile,
  DistributionBin,
  FeaturedCycle,
  FiveStarInterval,
  GachaRecord,
  Overview,
  PoolInsight,
} from "./types";

/** 抽取顺序：时间升序；同一时间戳（十连）按接口原始下标倒序 */
export function sortDrawOrder(records: readonly GachaRecord[]): GachaRecord[] {
  return [...records].sort((a, b) => {
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    // 接口新→旧返回，下标越大越早，所以倒序才是真实抽取顺序
    return b.order - a.order;
  });
}

export function isOffRateRecord(record: GachaRecord, poolType: string): boolean {
  return (
    record.qualityLevel === 5 &&
    record.resourceType === "role" &&
    LIMITED_CHAR_POOL_IDS.has(poolType) &&
    STANDARD_FIVE_STAR_ROLE_IDS.has(record.resourceId)
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 按 10 抽一档分箱；80 抽落在最后一箱 */
export function buildDistribution(intervals: readonly number[]): DistributionBin[] {
  const bins: DistributionBin[] = Array.from({ length: 8 }, (_, index) => ({
    start: index * 10 + 1,
    end: index * 10 + 10,
    label: `${index * 10 + 1}–${index * 10 + 10}`,
    count: 0,
  }));

  for (const pulls of intervals) {
    if (pulls <= 0) continue;
    const index = Math.min(bins.length - 1, Math.floor((pulls - 1) / 10));
    bins[index].count += 1;
  }

  return bins;
}

/** 经验累计出金率：第 n 抽前已经出金的区间占比 */
export function buildCumulativeCurve(
  intervals: readonly number[],
  hardPity: number,
): { pull: number; percentage: number }[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = sorted.length;
  let cursor = 0;

  return Array.from({ length: hardPity }, (_, index) => {
    const pull = index + 1;
    while (cursor < sorted.length && sorted[cursor] <= pull) cursor++;
    return { pull, percentage: (cursor / total) * 100 };
  });
}

export function buildPoolInsight(poolType: string, records: readonly GachaRecord[]): PoolInsight {
  const sorted = sortDrawOrder(records);
  const hardPity = hardPityForPool(poolType);

  const intervals: FiveStarInterval[] = [];
  let lastFiveStarIndex = -1;
  let currentPityLowerBound = false;

  // 50/50 状态机
  let featuredAttempts = 0;
  let featuredWins = 0;
  let featuredOffRate = 0;
  let awaitingGuarantee = false;

  // UP 周期
  const featuredCycles: FeaturedCycle[] = [];
  let cycleStartIndex = 0;
  let cycleOffRateRecords: GachaRecord[] = [];

  sorted.forEach((record, index) => {
    if (record.qualityLevel !== 5) return;

    const pulls = index - lastFiveStarIndex;
    const isOffRate = isOffRateRecord(record, poolType);
    intervals.push({
      record,
      pulls,
      // 第一个区间之前的历史可能被官方截断，真实值只会更大
      isLowerBound: intervals.length === 0,
      isOffRate,
    });
    lastFiveStarIndex = index;

    if (!LIMITED_CHAR_POOL_IDS.has(poolType) || record.resourceType !== "role") return;

    if (isOffRate) {
      // 歪了一定会进入大保底；数据异常（连续歪）时保留保底状态
      if (!awaitingGuarantee) {
        featuredAttempts += 1;
        awaitingGuarantee = true;
      }
      featuredOffRate += 1;
      cycleOffRateRecords.push(record);
      return;
    }

    if (!awaitingGuarantee) {
      // 真正的 50/50：赢了
      featuredAttempts += 1;
      featuredWins += 1;
    }
    awaitingGuarantee = false;

    featuredCycles.push({
      record,
      pulls: index - cycleStartIndex + 1,
      offRateRecords: cycleOffRateRecords,
      // 第一个周期从历史开头算起，起点可能被截断
      isLowerBound: featuredCycles.length === 0,
    });
    cycleStartIndex = index + 1;
    cycleOffRateRecords = [];
  });

  const completeIntervals = intervals.filter((interval) => !interval.isLowerBound).map((i) => i.pulls);
  const completeCycles = featuredCycles.filter((cycle) => !cycle.isLowerBound);
  const cyclePulls = completeCycles.map((cycle) => cycle.pulls);

  const currentPity = sorted.length - (lastFiveStarIndex + 1);
  // 没有五星时，当前垫抽依赖历史是否完整
  currentPityLowerBound = lastFiveStarIndex < 0;

  return {
    poolType,
    poolName: getPoolDisplayName(poolType),
    groupLabel: getPoolGroupLabel(poolType),
    totalPulls: sorted.length,
    fiveStarCount: intervals.length,
    hardPity,
    currentPity,
    currentPityLowerBound,
    intervals,
    averagePity: average(completeIntervals),
    medianPity: median(completeIntervals),
    bestPity: completeIntervals.length ? Math.min(...completeIntervals) : null,
    worstPity: completeIntervals.length ? Math.max(...completeIntervals) : null,
    distribution: buildDistribution(completeIntervals),
    featuredAttempts,
    featuredWins,
    featuredOffRate,
    featuredWinRate: featuredAttempts > 0 ? (featuredWins / featuredAttempts) * 100 : null,
    featuredCycles,
    featuredAveragePulls: average(cyclePulls),
    featuredMedianPulls: median(cyclePulls),
    featuredBestPulls: cyclePulls.length ? Math.min(...cyclePulls) : null,
    featuredWorstPulls: cyclePulls.length ? Math.max(...cyclePulls) : null,
    cumulative: buildCumulativeCurve(completeIntervals, hardPity),
  };
}

export function buildOverview(records: readonly GachaRecord[]): Overview {
  const byPool = new Map<string, GachaRecord[]>();
  for (const record of records) {
    const bucket = byPool.get(record.poolType);
    if (bucket) bucket.push(record);
    else byPool.set(record.poolType, [record]);
  }

  // 按官方池序排列，展示稳定
  const poolOrder = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
  const pools = [...byPool.entries()]
    .sort(([a], [b]) => poolOrder.indexOf(a) - poolOrder.indexOf(b))
    .map(([poolType, poolRecords]) => buildPoolInsight(poolType, poolRecords));

  const allCompleteIntervals = pools.flatMap((pool) =>
    pool.intervals.filter((interval) => !interval.isLowerBound).map((interval) => interval.pulls),
  );

  const featuredAttempts = pools.reduce((sum, pool) => sum + pool.featuredAttempts, 0);
  const featuredWins = pools.reduce((sum, pool) => sum + pool.featuredWins, 0);

  const fiveStarCount = records.filter((record) => record.qualityLevel === 5).length;
  const fourStarCount = records.filter((record) => record.qualityLevel === 4).length;
  const times = records.map((record) => record.time).sort();

  return {
    totalPulls: records.length,
    fiveStarCount,
    fourStarCount,
    fiveStarRate: records.length > 0 ? (fiveStarCount / records.length) * 100 : 0,
    averagePity: average(allCompleteIntervals),
    medianPity: median(allCompleteIntervals),
    bestPity: allCompleteIntervals.length ? Math.min(...allCompleteIntervals) : null,
    worstPity: allCompleteIntervals.length ? Math.max(...allCompleteIntervals) : null,
    featuredAttempts,
    featuredWins,
    featuredWinRate: featuredAttempts > 0 ? (featuredWins / featuredAttempts) * 100 : null,
    earliestTime: times[0] ?? null,
    latestTime: times[times.length - 1] ?? null,
    pools: pools.filter((pool) => pool.totalPulls > 0),
  };
}

/**
 * 单个角色/武器的获取成本档案。
 *
 * costPulls = 从上一个同名目标（或历史起点）到本次获取的全部抽数，含前置歪。
 */
export function buildCostProfile(
  poolType: string,
  records: readonly GachaRecord[],
  resourceId: number,
): CostProfile | null {
  const sorted = sortDrawOrder(records.filter((record) => record.poolType === poolType));
  const acquisitions: Acquisition[] = [];

  let lastFiveStarIndex = -1;
  let lastTargetIndex = -1;
  let offRateSinceTarget = 0;
  let cumulativePulls = 0;

  sorted.forEach((record, index) => {
    if (record.qualityLevel !== 5) return;

    const pulls = index - lastFiveStarIndex;
    lastFiveStarIndex = index;

    if (record.resourceId !== resourceId) {
      // 只把同池的歪计入目标成本
      if (isOffRateRecord(record, poolType)) offRateSinceTarget += 1;
      return;
    }

    const costPulls = index - lastTargetIndex;
    cumulativePulls += costPulls;
    acquisitions.push({
      record,
      pulls,
      isLowerBound: acquisitions.length === 0,
      offRateBefore: offRateSinceTarget,
      costPulls,
      cumulativePulls,
    });

    lastTargetIndex = index;
    offRateSinceTarget = 0;
  });

  const firstTarget = acquisitions[0]?.record;
  if (!firstTarget) return null;

  const costs = acquisitions.map((acquisition) => acquisition.costPulls);

  return {
    resourceId,
    name: firstTarget.name,
    resourceType: firstTarget.resourceType,
    poolType,
    poolName: getPoolDisplayName(poolType),
    acquisitions,
    totalPulls: costs.reduce((sum, value) => sum + value, 0),
    averagePulls: average(costs),
    bestPulls: Math.min(...costs),
    worstPulls: Math.max(...costs),
    isLowerBound: acquisitions[0].isLowerBound,
  };
}

/** 找出某个角色专属的常驻五星判定，导出给 UI 做「歪」标记 */
export function isStandardFiveStar(record: GachaRecord): boolean {
  return (
    STANDARD_FIVE_STAR_ROLE_IDS.has(record.resourceId) ||
    STANDARD_FIVE_STAR_WEAPON_IDS.has(record.resourceId)
  );
}
