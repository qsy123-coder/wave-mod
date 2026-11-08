import { describe, expect, it } from "vitest";

import {
  POOLS,
  POOL_API_NAME_TO_ID,
  getPoolDisplayName,
  getPoolGroupLabel,
  hardPityForPool,
  hasSoftPity,
  isLimitedCharPool,
} from "./pools";

describe("pools", () => {
  it("覆盖官方 13 类卡池", () => {
    expect(POOLS).toHaveLength(13);
    expect(POOLS.map((pool) => pool.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
    ]);
  });

  it("中文池名能反查回数字 ID", () => {
    expect(POOL_API_NAME_TO_ID.get("角色精准调谐")).toBe("1");
    expect(POOL_API_NAME_TO_ID.get("武器精准调谐")).toBe("2");
    expect(POOL_API_NAME_TO_ID.get("角色忆旅调谐")).toBe("12");
  });

  it("新手池硬保底 50，其余 80", () => {
    expect(hardPityForPool("5")).toBe(50);
    expect(hardPityForPool("1")).toBe(80);
    expect(hardPityForPool("13")).toBe(80);
  });

  it("新手池没有软保底曲线", () => {
    expect(hasSoftPity("5")).toBe(false);
    expect(hasSoftPity("1")).toBe(true);
  });

  it("只有 1/8/10/12 是限定角色池", () => {
    for (const id of ["1", "8", "10", "12"]) {
      expect(isLimitedCharPool(id)).toBe(true);
    }
    for (const id of ["2", "3", "4", "5", "6", "7", "9", "11", "13"]) {
      expect(isLimitedCharPool(id)).toBe(false);
    }
  });

  it("展示名与分组回退到「未知/其他」而不是抛错", () => {
    expect(getPoolDisplayName("99")).toBe("未知卡池");
    expect(getPoolGroupLabel("99")).toBe("其他");
    expect(getPoolGroupLabel("1")).toBe("UP 角色池");
    expect(getPoolGroupLabel("3")).toBe("常驻角色池");
  });
});
