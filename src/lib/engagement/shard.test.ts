import { describe, expect, it } from "vitest";

import { engagementShardIndex, engagementShardKey, ENGAGEMENT_SHARD_COUNT } from "./shard";

/**
 * 分片哈希的护栏。
 *
 * 期望值是**钉死的**：如果改了 hash（或不小心动了常量），这些断言会立刻失败。
 * 为什么值得钉死：`scripts/migrate-engagement-to-cos.mjs` 里有一份同样的实现，
 * 两边一旦漂移，迁移后的数据会落进线上不读的分片 —— 表现为计数静默消失，
 * 而且没有任何报错。见 shard.ts 顶部注释。
 */
describe("engagementShardIndex", () => {
  it("已知 id 的分片固定不变（与迁移脚本保持一致）", () => {
    expect(engagementShardIndex("051efd2a-a8ae-4486-ba93-5089a04b70bb")).toBe(9);
    expect(engagementShardIndex("7d3181e0-2261-4bd5-b83b-334bf1432c14")).toBe(9);
    expect(engagementShardIndex("mod-1")).toBe(1);
    expect(engagementShardIndex("")).toBe(5);
  });

  it("结果始终落在 [0, shardCount)", () => {
    for (let i = 0; i < 500; i += 1) {
      const index = engagementShardIndex(`mod-${i}-${i * 7919}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(ENGAGEMENT_SHARD_COUNT);
    }
  });

  it("分布大致均匀（不是全挤在几片）", () => {
    const buckets = new Array(ENGAGEMENT_SHARD_COUNT).fill(0) as number[];
    for (let i = 0; i < 3200; i += 1) {
      buckets[engagementShardIndex(`11111111-2222-4333-8444-${String(i).padStart(12, "0")}`)] += 1;
    }
    const min = Math.min(...buckets);
    const max = Math.max(...buckets);
    // 3200 / 16 = 200 每片；允许 ±60% 的抖动
    expect(min).toBeGreaterThan(80);
    expect(max).toBeLessThan(320);
  });
});

describe("engagementShardKey", () => {
  it("键名带版本前缀，迁移前后互不覆盖", () => {
    expect(engagementShardKey(0)).toBe("engagement/v2/shard-0.json");
    expect(engagementShardKey(15)).toBe("engagement/v2/shard-15.json");
  });
});
