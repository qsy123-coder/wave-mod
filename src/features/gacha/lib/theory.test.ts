import { describe, expect, it } from "vitest";

import {
  BASE_FIVE_STAR_RATE,
  cumulativeProbability,
  expectedFiveStarPulls,
  expectedUpPulls,
  fiveStarRateAtPull,
  survivalAtPull,
  theoreticalMedianPull,
} from "./theory";

describe("theory", () => {
  it("1–65 抽固定 0.8%", () => {
    expect(fiveStarRateAtPull(1)).toBe(BASE_FIVE_STAR_RATE);
    expect(fiveStarRateAtPull(65)).toBeCloseTo(0.008, 10);
  });

  it("66–70 每抽 +4%", () => {
    expect(fiveStarRateAtPull(66)).toBeCloseTo(0.048, 10);
    expect(fiveStarRateAtPull(70)).toBeCloseTo(0.208, 10);
  });

  it("71–75 每抽 +8%", () => {
    expect(fiveStarRateAtPull(71)).toBeCloseTo(0.288, 10);
    expect(fiveStarRateAtPull(75)).toBeCloseTo(0.608, 10);
  });

  it("76–78 每抽 +10%", () => {
    expect(fiveStarRateAtPull(76)).toBeCloseTo(0.708, 10);
    expect(fiveStarRateAtPull(78)).toBeCloseTo(0.908, 10);
  });

  it("79 抽必出，之后保持 100%", () => {
    expect(fiveStarRateAtPull(79)).toBe(1);
    expect(fiveStarRateAtPull(80)).toBe(1);
  });

  it("概率在 0..1 之间且单调不减", () => {
    let previous = 0;
    for (let pull = 1; pull <= 80; pull++) {
      const rate = fiveStarRateAtPull(pull);
      expect(rate).toBeGreaterThanOrEqual(previous);
      expect(rate).toBeLessThanOrEqual(1);
      previous = rate;
    }
  });

  it("累计概率单调递增，79 抽达到 100%", () => {
    let previous = 0;
    for (let pull = 1; pull <= 80; pull++) {
      const value = cumulativeProbability(pull);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(cumulativeProbability(79)).toBeCloseTo(1, 10);
  });

  it("生存概率与累计概率互补", () => {
    for (const pull of [1, 30, 65, 70, 78]) {
      expect(survivalAtPull(pull) + cumulativeProbability(pull)).toBeCloseTo(1, 10);
    }
  });

  it("理论期望约 54.1 抽（源项目展示值）", () => {
    expect(expectedFiveStarPulls()).toBeCloseTo(54.1, 1);
  });

  it("UP 理论期望约 81.15 抽", () => {
    expect(expectedUpPulls()).toBeCloseTo(81.15, 1);
  });

  it("理论中位数是 68 抽", () => {
    expect(theoreticalMedianPull()).toBe(68);
  });
});
