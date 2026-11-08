/**
 * 把统计结果翻译成一句人话。
 *
 * 刻意保守：完整五星区间少于 5 个时不下「欧/非」结论 —— 小样本的均值波动极大，
 * 那时候给结论只会误导。
 */

import { expectedFiveStarPulls } from "./theory";
import type { Overview } from "./types";

export type VerdictTone = "insufficient" | "lucky" | "normal" | "unlucky";

export type Verdict = {
  tone: VerdictTone;
  title: string;
  detail: string;
};

const MIN_SAMPLE = 5;

export function buildVerdict(overview: Overview): Verdict {
  const completeIntervals = overview.pools.reduce(
    (sum, pool) => sum + pool.intervals.filter((interval) => !interval.isLowerBound).length,
    0,
  );

  if (completeIntervals < MIN_SAMPLE || overview.averagePity === null) {
    return {
      tone: "insufficient",
      title: "样本还不够",
      detail: `完整五星区间 ${completeIntervals} 个，至少 ${MIN_SAMPLE} 个再比较更有意义。`,
    };
  }

  const theory = expectedFiveStarPulls();
  const average = overview.averagePity;
  const deltaPercent = ((average - theory) / theory) * 100;

  const tone: VerdictTone = deltaPercent <= -10 ? "lucky" : deltaPercent >= 10 ? "unlucky" : "normal";

  const title =
    tone === "lucky" ? "这段时间偏欧" : tone === "unlucky" ? "这段时间偏非" : "接近理论值";

  const featuredNote =
    overview.featuredAttempts >= 4 && overview.featuredWinRate !== null
      ? `；限定角色池 50/50 赢 ${overview.featuredWins}/${overview.featuredAttempts} 次`
      : "";

  return {
    tone,
    title,
    detail: `平均 ${average.toFixed(1)} 抽出一个五星，理论期望 ${theory.toFixed(1)} 抽（${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(1)}%）${featuredNote}。`,
  };
}
