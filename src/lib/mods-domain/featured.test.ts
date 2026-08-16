import { describe, expect, it } from "vitest";

import { mapMod } from "./mappers";
import { buildFeaturedOrderMap, sortFeaturedModsByOrder } from "./sorting";
import type { ModRow, SiteMod } from "./types";

function createMod(overrides: Partial<SiteMod> = {}): SiteMod {
  return {
    character: "长离",
    commentsCount: 0,
    coverImage: "https://example.com/cover.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "默认描述内容",
    downloadUrl: null,
    downloads: 0,
    driveLinks: [],
    favorites: 0,
    gameKey: "wuthering-waves",
    gameVersion: "2.0",
    id: "mod-default",
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

function makeRow(overrides: Record<string, unknown> = {}): ModRow {
  return {
    id: "mod-row",
    title: "测试 MOD",
    character: "长离",
    version: "1.0",
    game_version: "2.0",
    game_key: "wuthering-waves",
    description: "描述",
    video_url: null,
    mod_author_url: null,
    xxmi_install_guide: "使用 XXMI。",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ModRow;
}

// ==================== sortFeaturedModsByOrder ====================

describe("sortFeaturedModsByOrder", () => {
  it("按 featuredOrder 升序排列", () => {
    const mods = [
      createMod({ id: "a", featuredOrder: 3, createdAt: "2026-03-01T00:00:00.000Z" }),
      createMod({ id: "b", featuredOrder: 1, createdAt: "2026-01-01T00:00:00.000Z" }),
      createMod({ id: "c", featuredOrder: 2, createdAt: "2026-02-01T00:00:00.000Z" }),
    ];

    const result = sortFeaturedModsByOrder(mods);

    expect(result.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("null/undefined 的 featureOrder 排最后", () => {
    const mods = [
      createMod({ id: "null-order", featuredOrder: null, createdAt: "2026-01-01T00:00:00.000Z" }),
      createMod({ id: "no-order", createdAt: "2026-01-01T00:00:00.000Z" }),
      createMod({ id: "ordered", featuredOrder: 1, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];

    const result = sortFeaturedModsByOrder(mods);

    expect(result.map((m) => m.id)).toEqual(["ordered", "null-order", "no-order"]);
  });

  it("无顺序的 mod 之间按 created_at 倒序兜底", () => {
    const mods = [
      createMod({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }),
      createMod({ id: "newer", createdAt: "2026-02-01T00:00:00.000Z" }),
    ];

    const result = sortFeaturedModsByOrder(mods);

    expect(result.map((m) => m.id)).toEqual(["newer", "older"]);
  });

  it("顺序相同时按 created_at 倒序兜底", () => {
    const mods = [
      createMod({ id: "same-older", featuredOrder: 2, createdAt: "2026-01-01T00:00:00.000Z" }),
      createMod({ id: "same-newer", featuredOrder: 2, createdAt: "2026-03-01T00:00:00.000Z" }),
    ];

    const result = sortFeaturedModsByOrder(mods);

    expect(result.map((m) => m.id)).toEqual(["same-newer", "same-older"]);
  });

  it("不修改原数组（返回新数组）", () => {
    const mods = [createMod({ id: "a", featuredOrder: 1 })];
    const result = sortFeaturedModsByOrder(mods);

    expect(result).not.toBe(mods);
    expect(mods[0].id).toBe("a");
  });
});

// ==================== mapMod 的 featuredOrder 映射 ====================

describe("mapMod featuredOrder", () => {
  it("映射 featured_order 为 featuredOrder", () => {
    expect(mapMod(makeRow({ featured_order: 5 })).featuredOrder).toBe(5);
  });

  it("缺少 featured_order 时映射为 null", () => {
    expect(mapMod(makeRow()).featuredOrder).toBeNull();
  });
});

// ==================== buildFeaturedOrderMap ====================

describe("buildFeaturedOrderMap", () => {
  it("前 maxSlots 个依次编号，其余为 null（待轮播）", () => {
    const result = buildFeaturedOrderMap(["a", "b", "c", "d"], 2);

    expect(result).toEqual([
      { id: "a", featuredOrder: 1 },
      { id: "b", featuredOrder: 2 },
      { id: "c", featuredOrder: null },
      { id: "d", featuredOrder: null },
    ]);
  });

  it("不足 maxSlots 时全部编号，无待轮播", () => {
    expect(buildFeaturedOrderMap(["a"], 6)).toEqual([{ id: "a", featuredOrder: 1 }]);
  });

  it("空列表返回空数组", () => {
    expect(buildFeaturedOrderMap([], 6)).toEqual([]);
  });
});
