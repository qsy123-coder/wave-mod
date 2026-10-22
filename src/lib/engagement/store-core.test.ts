import { describe, expect, it } from "vitest";

import {
  applyAction,
  computeCounts,
  computeCountsFromIncrements,
  computeMine,
  emptyState,
  listFavoritedIds,
  parseBaseline,
  parseState,
  pruneDayBuckets,
  shanghaiDayKey,
} from "@/lib/engagement/store-core";

const MOD = "11111111-1111-4111-8111-111111111111";
const A = "device-aaaaaaaa";
const B = "device-bbbbbbbb";

describe("computeCounts", () => {
  it("没有基线也没有增量时全为 0", () => {
    expect(computeCounts(emptyState(), {}, MOD)).toEqual({
      likes: 0,
      favorites: 0,
      views: 0,
      downloads: 0,
      downloadsReal: 0,
    });
  });

  it("基线 + 增量累加，而不是覆盖", () => {
    const state = emptyState();
    applyAction(state, "like", MOD, A, "2026-10-02");

    expect(computeCounts(state, { [MOD]: { likes: 7, favorites: 3, views: 100 } }, MOD)).toEqual({
      likes: 8,
      favorites: 3,
      views: 100,
      // 下载 = 浏览量 100 的 65%
      downloads: 65,
      // 真实下载增量为 0
      downloadsReal: 0,
    });
  });
});

/**
 * 三种后端（本地文件 / COS 分片 / Postgres）的增量形态不同：
 * 前两者是数组长度与计数，Postgres 是三个 bigint 列。展示口径必须一致，
 * 否则换存储时会出现「数字悄悄变小」——没有报错，只能靠用例钉住。
 */
describe("computeCountsFromIncrements", () => {
  it("基线缺失时按 0 处理", () => {
    expect(computeCountsFromIncrements(undefined, { likes: 2, favorites: 1, views: 9 })).toEqual({
      likes: 2,
      favorites: 1,
      views: 9,
      // 没有基线也要按浏览量给下载数：9 × 0.65 ≈ 6
      downloads: 6,
      downloadsReal: 0,
    });
  });

  it("基线 + 增量逐字段相加", () => {
    expect(
      computeCountsFromIncrements({ likes: 47, favorites: 285, views: 45_720 }, { likes: 1, favorites: 0, views: 3 }),
    ).toEqual({
      likes: 48,
      favorites: 285,
      views: 45_723,
      downloads: Math.round(45_723 * 0.65),
      downloadsReal: 0,
    });
  });

  it("基线只导了部分列时其余列按 0", () => {
    expect(computeCountsFromIncrements({ likes: 5 }, { likes: 1, favorites: 2, views: 3 })).toEqual({
      likes: 6,
      favorites: 2,
      views: 3,
      downloads: 2,
      downloadsReal: 0,
    });
  });

  it("下载 = 浏览量 × 65% + 真实下载增量", () => {
    // 新 mod：没有基线，20 次浏览、点过 1 次下载 ⇒ 13 + 1
    expect(computeCountsFromIncrements(undefined, { views: 20, downloads: 1 }).downloads).toBe(14);
    // 老 mod：基线 43 浏览 + 0 增量 ⇒ 28（与 65% 口径一致）
    expect(computeCountsFromIncrements({ views: 43 }, {}).downloads).toBe(28);
  });
});

describe("点赞 / 收藏去重", () => {
  it("同一设备重复触发是抵消（toggle）", () => {
    const state = emptyState();

    applyAction(state, "like", MOD, A, "2026-10-02");
    expect(computeCounts(state, {}, MOD).likes).toBe(1);
    expect(computeMine(state, MOD, A).liked).toBe(true);

    applyAction(state, "like", MOD, A, "2026-10-02");
    expect(computeCounts(state, {}, MOD).likes).toBe(0);
    expect(computeMine(state, MOD, A).liked).toBe(false);
  });

  it("不同设备各算一次", () => {
    const state = emptyState();

    applyAction(state, "like", MOD, A, "2026-10-02");
    applyAction(state, "like", MOD, B, "2026-10-02");

    expect(computeCounts(state, {}, MOD).likes).toBe(2);
  });

  it("unlike 对不在列表里的设备是 no-op —— 不扣基线", () => {
    const state = emptyState();

    // 模拟：该用户在 Supabase 时代赞过（只体现在基线里），本次从未记录过设备号
    applyAction(state, "unlike", MOD, A, "2026-10-02");

    expect(computeCounts(state, { [MOD]: { likes: 5 } }, MOD).likes).toBe(5);
  });

  it("收藏与点赞互不影响", () => {
    const state = emptyState();

    applyAction(state, "favorite", MOD, A, "2026-10-02");

    expect(computeCounts(state, {}, MOD)).toEqual({
      likes: 0,
      favorites: 1,
      views: 0,
      downloads: 0,
      downloadsReal: 0,
    });
  });
});

describe("listFavoritedIds（我的收藏清单）", () => {
  it("只回这台设备收藏的，且最近收藏的排在最前", () => {
    const state = emptyState();
    const modA = "11111111-1111-4111-8111-111111111111";
    const modB = "22222222-2222-4222-8222-222222222222";
    const modC = "33333333-3333-4333-8333-333333333333";

    applyAction(state, "favorite", modA, A, "2026-10-02", "2026-10-02T01:00:00.000Z");
    applyAction(state, "favorite", modB, A, "2026-10-02", "2026-10-02T03:00:00.000Z");
    applyAction(state, "favorite", modC, B, "2026-10-02", "2026-10-02T05:00:00.000Z");

    expect(listFavoritedIds(state, A)).toEqual([modB, modA]);
    expect(listFavoritedIds(state, B)).toEqual([modC]);
    expect(listFavoritedIds(state, "device-zzzzzzzz")).toEqual([]);
  });

  it("取消收藏后立刻从清单消失（时间戳一起清掉，不留幽灵条目）", () => {
    const state = emptyState();

    applyAction(state, "favorite", MOD, A, "2026-10-02", "2026-10-02T01:00:00.000Z");
    expect(listFavoritedIds(state, A)).toEqual([MOD]);

    applyAction(state, "unfavorite", MOD, A, "2026-10-02");
    expect(listFavoritedIds(state, A)).toEqual([]);
    expect(state.mods[MOD].favoritedAt[A]).toBeUndefined();
  });

  it("再次点击收藏（toggle 关掉）也会清掉时间戳", () => {
    const state = emptyState();

    applyAction(state, "favorite", MOD, A, "2026-10-02", "2026-10-02T01:00:00.000Z");
    applyAction(state, "favorite", MOD, A, "2026-10-02", "2026-10-02T02:00:00.000Z");

    expect(listFavoritedIds(state, A)).toEqual([]);
  });
});

describe("下载：同设备同天只算一次（2026-10-22 起）", () => {
  it("同一设备同一天连点两次只算一次", () => {
    const state = emptyState();

    applyAction(state, "download", MOD, A, "2026-10-02");
    applyAction(state, "download", MOD, A, "2026-10-02");

    expect(computeCounts(state, {}, MOD).downloads).toBe(1);
    expect(computeCounts(state, {}, MOD).downloadsReal).toBe(1);
  });

  it("换一天或换一台设备，都算新的一次", () => {
    const state = emptyState();

    applyAction(state, "download", MOD, A, "2026-10-02");
    applyAction(state, "download", MOD, A, "2026-10-03");
    applyAction(state, "download", MOD, B, "2026-10-02");

    expect(computeCounts(state, {}, MOD).downloadsReal).toBe(3);
  });

  it("去重表里只记设备号，不对外暴露点击次数", () => {
    const state = emptyState();

    applyAction(state, "download", MOD, A, "2026-10-02");
    applyAction(state, "download", MOD, A, "2026-10-02");

    expect(state.mods[MOD].downloadDays).toEqual({ "2026-10-02": [A] });
  });

  it("真实下载叠在 65% 之上", () => {
    const state = emptyState();
    applyAction(state, "download", MOD, A, "2026-10-02");

    // 基线 43 浏览 ⇒ 65% = 28，再加 1 次真实下载
    expect(computeCounts(state, { [MOD]: { views: 43 } }, MOD).downloads).toBe(29);
    // 另一种口径只算真实点击，不掺浏览量 —— 2026-10-22 起的新 mod 用它
    expect(computeCounts(state, { [MOD]: { views: 43 } }, MOD).downloadsReal).toBe(1);
  });
});

describe("浏览：同设备同天只算一次", () => {
  it("同一设备同一天重复上报不增加", () => {
    const state = emptyState();

    applyAction(state, "view", MOD, A, "2026-10-02");
    applyAction(state, "view", MOD, A, "2026-10-02");
    applyAction(state, "view", MOD, A, "2026-10-02");

    expect(computeCounts(state, {}, MOD).views).toBe(1);
  });

  it("换一天、或换一台设备，都算新的", () => {
    const state = emptyState();

    applyAction(state, "view", MOD, A, "2026-10-02");
    applyAction(state, "view", MOD, A, "2026-10-03");
    applyAction(state, "view", MOD, B, "2026-10-02");

    expect(computeCounts(state, {}, MOD).views).toBe(3);
  });

  it("浏览是累加不是 toggle —— 重复上报绝不会把数字减回去", () => {
    const state = emptyState();

    applyAction(state, "view", MOD, A, "2026-10-02");
    applyAction(state, "view", MOD, A, "2026-10-02");

    expect(computeCounts(state, {}, MOD).views).toBe(1);
    expect(computeCounts(state, {}, MOD).views).toBeGreaterThanOrEqual(1);
  });
});

describe("pruneDayBuckets", () => {
  it("只保留最近两天，但累计浏览数不受影响", () => {
    const state = emptyState();

    applyAction(state, "view", MOD, A, "2026-09-01");
    applyAction(state, "view", MOD, B, "2026-10-02");
    applyAction(state, "view", MOD, "device-cccccccc", "2026-10-01");

    pruneDayBuckets(state, "2026-10-02", 2);

    expect(Object.keys(state.mods[MOD].viewDays).sort()).toEqual(["2026-10-01", "2026-10-02"]);
    // 09-01 的去重记录被清掉了，但它贡献的那一次浏览仍在累计值里
    expect(computeCounts(state, {}, MOD).views).toBe(3);
  });

  it("清掉旧日期后，老设备再访问会被当成新的一次（可接受的漂移）", () => {
    const state = emptyState();

    applyAction(state, "view", MOD, A, "2026-09-01");
    pruneDayBuckets(state, "2026-10-02", 2);
    applyAction(state, "view", MOD, A, "2026-10-02");

    expect(computeCounts(state, {}, MOD).views).toBe(2);
  });
});

describe("parseState / parseBaseline 宽容解析", () => {
  it("坏输入一律退化成空状态，不抛错", () => {
    expect(parseState(null)).toEqual({ version: 1, mods: {} });
    expect(parseState("nope")).toEqual({ version: 1, mods: {} });
    expect(parseState({ mods: 5 })).toEqual({ version: 1, mods: {} });
    expect(parseBaseline(undefined)).toEqual({});
  });

  it("只有坏字段被丢弃，好字段照常读回", () => {
    const state = parseState({
      mods: {
        [MOD]: {
          likedBy: [A, 42, null],
          favoritedBy: "bad",
          views: "12",
          viewDays: { "2026-10-02": [B, 7] },
          downloadDays: { "2026-10-02": [A, null], "2026-10-03": "bad" },
        },
      },
    });

    expect(state.mods[MOD].likedBy).toEqual([A]);
    expect(state.mods[MOD].favoritedBy).toEqual([]);
    expect(state.mods[MOD].favoritedAt).toEqual({});
    expect(state.mods[MOD].views).toBe(12);
    expect(state.mods[MOD].viewDays).toEqual({ "2026-10-02": [B] });
    expect(state.mods[MOD].downloadDays).toEqual({ "2026-10-02": [A] });
  });

  it("基线里的负数与 NaN 归零", () => {
    expect(parseBaseline({ [MOD]: { likes: -3, views: Number.NaN, favorites: 4 } })).toEqual({
      [MOD]: { likes: 0, views: 0, favorites: 4 },
    });
  });
});

describe("shanghaiDayKey", () => {
  it("按上海时区切日（UTC 深夜属于上海的第二天）", () => {
    // 2026-10-02T16:30:00Z = 上海 2026-10-03 00:30
    expect(shanghaiDayKey(new Date("2026-10-02T16:30:00Z"))).toBe("2026-10-03");
    // 2026-10-02T04:00:00Z = 上海 2026-10-02 12:00
    expect(shanghaiDayKey(new Date("2026-10-02T04:00:00Z"))).toBe("2026-10-02");
  });
});
