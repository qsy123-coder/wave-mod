import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PREVIEW_URL } from "./preview-image";
import {
  applyModQueryFilters,
  applyModSort,
  calculateHotScore,
  parseCharacterFilter,
  parseModFlag,
  parseModQuery,
  parseModSort,
  rankModsByQuery,
  sortModsByHot,
} from "./sorting";
import type { SiteMod } from "./types";

function createMod(overrides: Partial<SiteMod>): SiteMod {
  return {
    character: "今汐",
    commentsCount: 0,
    coverImage: "https://example.oss-cn-shanghai.aliyuncs.com/cover.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "默认描述内容",
    downloadUrl: null,
    downloads: 0,
    driveLinks: [],
    favorites: 0,
    gameKey: "wuthering-waves",
    gameVersion: "2.0",
    id: crypto.randomUUID(),
    images: [],
    likes: 0,
    modAuthorUrl: null,
    nsfw: false,
    ratingAverage: 0,
    ratingCount: 0,
    title: "默认标题",
    version: "1.0.0",
    videoUrl: null,
    views: 0,
    xxmiInstallGuide: "默认安装说明",
    isFeatured: false,
    ...overrides,
  };
}

describe("mods-domain sorting helpers", () => {
  it("parses invalid or missing sort as latest by default", () => {
    expect(parseModSort(undefined)).toBe("latest");
    expect(parseModSort("unknown")).toBe("latest");
    expect(parseModSort("hot")).toBe("hot");
  });

  it("trims optional character and query filters", () => {
    expect(parseCharacterFilter("  今汐  ")).toBe("今汐");
    expect(parseCharacterFilter("   ")).toBeUndefined();
    expect(parseModQuery("  皮肤,高清  ")).toBe("皮肤,高清");
    expect(parseModQuery("   ")).toBeUndefined();
  });

  it("sorts by favorites with createdAt as tie breaker", () => {
    const older = createMod({ id: "11111111-1111-4111-8111-111111111111", favorites: 10, createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = createMod({ id: "22222222-2222-4222-8222-222222222222", favorites: 10, createdAt: "2026-02-01T00:00:00.000Z" });
    const least = createMod({ id: "33333333-3333-4333-8333-333333333333", favorites: 1, createdAt: "2026-03-01T00:00:00.000Z" });

    expect(applyModSort("favorites")([older, least, newer]).map((mod) => mod.id)).toEqual([newer.id, older.id, least.id]);
  });

  it("sorts hot mods by calculated score and stable tie breakers", () => {
    const popular = createMod({ id: "11111111-1111-4111-8111-111111111111", downloads: 40, views: 200 });
    const rated = createMod({ id: "22222222-2222-4222-8222-222222222222", downloads: 5, ratingAverage: 5, ratingCount: 10 });
    const quiet = createMod({ id: "33333333-3333-4333-8333-333333333333", downloads: 1, views: 5 });

    expect(calculateHotScore(popular)).toBeGreaterThan(calculateHotScore(quiet));
    expect(sortModsByHot([quiet, rated, popular])[0]?.id).toBe(popular.id);
  });

  it("filters by character and all query keywords", () => {
    const target = createMod({ title: "高清 战斗服", character: "今汐", description: "适合主线演出 白色质感" });
    const wrongCharacter = createMod({ title: "高清 战斗服", character: "长离", description: "白色质感" });
    const missingKeyword = createMod({ title: "普通战斗服", character: "今汐", description: "低清版本" });

    const { mods, relaxed } = applyModQueryFilters([target, wrongCharacter, missingKeyword], { character: "今汐", query: "高清 白色" });

    expect(mods).toEqual([target]);
    // AND 有结果就绝不放宽 —— 这是精准性护栏，放宽只该在「一个都全不中」时发生
    expect(relaxed).toBe(false);
  });
});

describe("含直链 / 含预览图 开关", () => {
  it("parseModFlag 只认 1/true", () => {
    expect(parseModFlag("1")).toBe(true);
    expect(parseModFlag("true")).toBe(true);
    expect(parseModFlag(" TRUE ")).toBe(true);
    expect(parseModFlag(undefined)).toBe(false);
    expect(parseModFlag("")).toBe(false);
    expect(parseModFlag("0")).toBe(false);
    expect(parseModFlag("yes")).toBe(false);
  });

  it("direct=true 只留 download_url 非空的（网盘链接不算直链）", () => {
    const direct = createMod({ downloadUrl: "https://mods-download.example.com/a.exe", driveLinks: [{ platform: "夸克", url: "https://pan.quark.cn/s/x" }] });
    const driveOnly = createMod({ driveLinks: [{ platform: "夸克", url: "https://pan.quark.cn/s/y" }] });

    expect(applyModQueryFilters([direct, driveOnly], { direct: true }).mods).toEqual([direct]);
  });

  it("direct 不开时不动结果", () => {
    const direct = createMod({ downloadUrl: "https://mods-download.example.com/a.exe" });
    const driveOnly = createMod({});

    expect(applyModQueryFilters([direct, driveOnly], {}).mods).toHaveLength(2);
    expect(applyModQueryFilters([direct, driveOnly], { direct: false }).mods).toHaveLength(2);
  });

  it("preview=true 剔掉占位图与没有图的", () => {
    const real = createMod({ images: ["https://wave-mod-preview.example.com/mods/x/1/preview.webp"] });
    const placeholder = createMod({ images: [PLACEHOLDER_PREVIEW_URL] });
    const empty = createMod({ images: [] });

    expect(applyModQueryFilters([real, placeholder, empty], { preview: true }).mods).toEqual([real]);
  });

  it("两个开关能叠加（同时要直链也要预览图）", () => {
    const both = createMod({ downloadUrl: "https://mods-download.example.com/a.exe", images: ["https://wave-mod-preview.example.com/mods/x/2/preview.webp"] });
    const directNoImage = createMod({ downloadUrl: "https://mods-download.example.com/b.exe", images: [PLACEHOLDER_PREVIEW_URL] });

    expect(applyModQueryFilters([both, directNoImage], { direct: true, preview: true }).mods).toEqual([both]);
  });

  it("与角色/关键词条件叠在一起也是取交集", () => {
    const hit = createMod({ character: "今汐", title: "高清 战斗服", downloadUrl: "https://mods-download.example.com/a.exe" });
    const wrongCharacter = createMod({ character: "长离", title: "高清 战斗服", downloadUrl: "https://mods-download.example.com/b.exe" });
    const noDirect = createMod({ character: "今汐", title: "高清 战斗服" });

    expect(applyModQueryFilters([hit, wrongCharacter, noDirect], { character: "今汐", query: "高清", direct: true }).mods).toEqual([hit]);
  });
});

describe("搜索：AND 优先、0 结果才放宽", () => {
  it("多关键词全中时取交集，且不放宽", () => {
    const bothKeywords = createMod({ title: "千咲 女仆装", description: "白色" });
    const onlyOne = createMod({ title: "千咲 战斗服", description: "黑色" });

    const { mods, relaxed } = applyModQueryFilters([bothKeywords, onlyOne], { query: "千咲 女仆" }, { relaxQuery: true });

    expect(mods).toEqual([bothKeywords]);
    expect(relaxed).toBe(false);
  });

  it("一个都全不中时才放宽，并按命中的字段给出权重", () => {
    const titleHitMod = createMod({ title: "千咲 战斗服", description: "普通描述" });
    const descHitMod = createMod({ title: "通用服装", description: "适合千咲" });

    const { mods, queryRanks, relaxed } = applyModQueryFilters([titleHitMod, descHitMod], { query: "千咲 女仆" }, { relaxQuery: true });

    expect(mods).toEqual([titleHitMod, descHitMod]);
    expect(relaxed).toBe(true);
    expect(queryRanks.get(titleHitMod.id)).toEqual({ hits: 1, weight: 3 }); // 标题命中
    expect(queryRanks.get(descHitMod.id)).toEqual({ hits: 1, weight: 1 }); // 仅描述命中
  });

  it("不传 relaxQuery 时行为与改动前一致：0 结果就是 0 结果", () => {
    const titleHitMod = createMod({ title: "千咲 战斗服" });
    const descHitMod = createMod({ title: "通用服装", description: "适合千咲" });

    const { mods, relaxed } = applyModQueryFilters([titleHitMod, descHitMod], { query: "千咲 女仆" });

    expect(mods).toEqual([]);
    expect(relaxed).toBe(false);
  });

  it("单关键词不会因为「交集为空」而放宽（此时 AND 与 OR 恒等）", () => {
    const mod = createMod({ title: "千咲 战斗服" });

    const { mods, relaxed } = applyModQueryFilters([mod], { query: "千咲" }, { relaxQuery: true });

    expect(mods).toEqual([mod]);
    expect(relaxed).toBe(false);
  });

  it("放宽后仍然一个都不匹配：空结果，且不置 relaxed", () => {
    const nothing = createMod({ title: "他人装备", description: "全新材质" });

    const { mods, queryRanks, relaxed } = applyModQueryFilters([nothing], { query: "千咲 女仆" }, { relaxQuery: true });

    expect(mods).toEqual([]);
    expect(relaxed).toBe(false);
    expect(queryRanks.size).toBe(0);
  });

  it("空 query 不进入搜索逻辑（不筛也不放宽）", () => {
    const a = createMod({ title: "千咲 战斗服" });
    const b = createMod({ title: "通用服装" });

    const result = applyModQueryFilters([a, b], { query: "   " }, { relaxQuery: true });

    expect(result.mods).toHaveLength(2);
    expect(result.relaxed).toBe(false);
  });

  it("放宽只作用于 query：角色等其它条件照旧生效", () => {
    const sameCharacter = createMod({ character: "千咲", title: "通用服装", description: "适合千咲" });
    const otherCharacter = createMod({ character: "今汐", title: "通用服装", description: "适合千咲" });

    const { mods, relaxed } = applyModQueryFilters([sameCharacter, otherCharacter], { character: "千咲", query: "千咲 女仆" }, { relaxQuery: true });

    expect(mods).toEqual([sameCharacter]);
    expect(relaxed).toBe(true);
  });
});

describe("搜索：相关度排序", () => {
  it("标题命中的全部排在仅描述命中的前面", () => {
    const titleHitMod = createMod({ title: "千咲 战斗服", description: "" });
    const descHitMod = createMod({ title: "通用服装", description: "适合千咲" });
    const input = [descHitMod, titleHitMod];

    const { queryRanks, relaxed } = applyModQueryFilters(input, { query: "千咲" });

    expect(rankModsByQuery(input, queryRanks, relaxed).map((mod) => mod.id)).toEqual([titleHitMod.id, descHitMod.id]);
  });

  it("同分时保持传入顺序（稳定排序 —— 用户选的 sort 就靠它当次键）", () => {
    const first = createMod({ id: "11111111-1111-4111-8111-111111111111", title: "千咲 A" });
    const second = createMod({ id: "22222222-2222-4222-8222-222222222222", title: "千咲 B" });
    const third = createMod({ id: "33333333-3333-4333-8333-333333333333", title: "千咲 C" });
    const input = [first, second, third];

    const { queryRanks, relaxed } = applyModQueryFilters(input, { query: "千咲" });

    expect(rankModsByQuery(input, queryRanks, relaxed).map((mod) => mod.id)).toEqual([first.id, second.id, third.id]);
  });

  it("放宽时命中词多的排在命中词少的前面", () => {
    // 三个关键词，没有一条全中 ⇒ 走放宽分支；两条的 hits 不同才能验证这个键
    const twoHits = createMod({ title: "千咲 女仆装", description: "" });
    const oneHit = createMod({ title: "千咲 战斗服", description: "" });
    const input = [oneHit, twoHits];

    const { queryRanks, relaxed } = applyModQueryFilters(input, { query: "千咲 女仆 白" }, { relaxQuery: true });

    expect(relaxed).toBe(true);
    expect(rankModsByQuery(input, queryRanks, relaxed).map((mod) => mod.id)).toEqual([twoHits.id, oneHit.id]);
  });

  it("没有 query 时不动顺序", () => {
    const a = createMod({ title: "B" });
    const b = createMod({ title: "A" });
    const input = [a, b];

    const { queryRanks, relaxed } = applyModQueryFilters(input, {});

    expect(rankModsByQuery(input, queryRanks, relaxed)).toEqual(input);
  });
});
