/**
 * 官方公示概率的分段软保底模型。
 *
 * 数值来自《鸣潮》公示概率，与开源项目 juliy819/wuwa-gacha-tool 的
 * `src/pages/AnalyticsPage.tsx` 保持一致：
 *   1–65 抽 0.8%；66–70 每抽 +4%；71–75 每抽 +8%；76 起每抽 +10%；79 抽必出。
 *
 * 这些是「规则基线」，用于和玩家的实际表现对照；不是对未来的预测。
 */

export const BASE_FIVE_STAR_RATE = 0.008;
export const CONSOLIDATED_FIVE_STAR_RATE = 0.0185;
export const HARD_PITY = 80;
export const NOVICE_HARD_PITY = 50;

/**
 * 第 n 抽（从 1 开始）的单抽出金率。
 * n >= 79 时返回 1：官方在 79 抽必出，80 是硬保底上限。
 */
export function fiveStarRateAtPull(n: number): number {
  if (n <= 0) return 0;
  if (n <= 65) return BASE_FIVE_STAR_RATE;
  if (n <= 70) return BASE_FIVE_STAR_RATE + 0.04 * (n - 65);
  if (n <= 75) return BASE_FIVE_STAR_RATE + 0.04 * 5 + 0.08 * (n - 70);
  if (n <= 78) {
    return BASE_FIVE_STAR_RATE + 0.04 * 5 + 0.08 * 5 + 0.1 * (n - 75);
  }
  return 1;
}

/** 连续 n 抽都没出五星的概率（第 n 抽之后仍未出） */
export function survivalAtPull(n: number): number {
  let survival = 1;
  for (let pull = 1; pull <= n; pull++) {
    survival *= 1 - fiveStarRateAtPull(pull);
  }
  return survival;
}

/** 前 n 抽内出五星的累计概率 */
export function cumulativeProbability(n: number): number {
  return 1 - survivalAtPull(n);
}

/**
 * 随机变量「抽到五星所需抽数」的期望。
 * E[N] = Σ_{n=0}^{∞} P(N > n)，到 80 抽后 survival 已经归零。
 */
export function expectedFiveStarPulls(): number {
  let expected = 0;
  for (let n = 0; n < HARD_PITY; n++) {
    expected += survivalAtPull(n);
  }
  return expected;
}

/** 理论中位数：累计概率第一次达到 50% 的抽数 */
export function theoreticalMedianPull(): number {
  for (let n = 1; n <= HARD_PITY; n++) {
    if (cumulativeProbability(n) >= 0.5) return n;
  }
  return HARD_PITY;
}

/**
 * 一个 UP 角色的期望成本。
 *
 * 50/50 机制下，出 UP 的期望 = 每次五星的期望 × 1.5：
 * 一半情况一次命中，一半情况要再等一个大保底。
 * 54.1 × 1.5 ≈ 81.15，与源项目展示的「理论期望 81.15」一致。
 */
export function expectedUpPulls(): number {
  return expectedFiveStarPulls() * 1.5;
}
