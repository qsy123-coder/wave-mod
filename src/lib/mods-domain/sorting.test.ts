import { describe, expect, it } from "vitest";

import {
  applyModQueryFilters,
  applyModSort,
  calculateHotScore,
  parseCharacterFilter,
  parseModQuery,
  parseModSort,
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
  it("parses invalid or missing sort as default", () => {
    expect(parseModSort(undefined)).toBe("default");
    expect(parseModSort("unknown")).toBe("default");
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

    expect(applyModQueryFilters([target, wrongCharacter, missingKeyword], { character: "今汐", query: "高清 白色" })).toEqual([target]);
  });
});
