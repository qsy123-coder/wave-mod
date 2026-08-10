import { describe, expect, it } from "vitest";

import {
  adminModSortSchema,
  adminModStatusSchema,
  parseAdminGameKey,
  parseAdminModSort,
  parseAdminModStatus,
  parseAdminModsSearchParams,
  buildAdminModsHref,
  applyAdminModsView,
  getAdminCharacterCounts,
} from "./mods-filters";
import type { AdminMod } from "@/lib/mods-domain/types";

/** 最小合法 AdminMod 工厂，补齐 SiteMod 各字段 */
function makeMod(overrides: Partial<AdminMod> = {}): AdminMod {
  const defaults: AdminMod = {
    id: "00000000-0000-4000-8000-000000000000",
    title: "测试 MOD",
    character: "长离",
    description: "这是描述。",
    gameKey: "wuthering-waves",
    gameVersion: "2.0",
    version: "1.0",
    images: [],
    coverImage: "",
    downloadUrl: null,
    videoUrl: null,
    modAuthorUrl: null,
    xxmiInstallGuide: "使用 XXMI。",
    nsfw: false,
    driveLinks: [],
    views: 100,
    downloads: 50,
    favorites: 10,
    likes: 5,
    commentsCount: 3,
    ratingCount: 4,
    ratingAverage: 4.2,
    createdAt: new Date("2026-01-01").toISOString(),
    isFeatured: false,
    isPublished: true,
  };
  return { ...defaults, ...overrides };
}

function makeMods(overridesArray: Partial<AdminMod>[]): AdminMod[] {
  return overridesArray.map((o) => makeMod(o));
}

// ==================== 解析函数 ====================

describe("parseAdminModSort", () => {
  it("returns literal when valid", () => {
    expect(parseAdminModSort("downloads")).toBe("downloads");
    expect(parseAdminModSort("hot")).toBe("hot");
    expect(parseAdminModSort("latest")).toBe("latest");
    expect(parseAdminModSort("favorites")).toBe("favorites");
    expect(parseAdminModSort("rating")).toBe("rating");
  });

  it("falls back to latest on anything else", () => {
    expect(parseAdminModSort(undefined)).toBe("latest");
    expect(parseAdminModSort("")).toBe("latest");
    expect(parseAdminModSort("DESC")).toBe("latest");
    expect(parseAdminModSort("asc")).toBe("latest");
    expect(parseAdminModSort(" ")).toBe("latest");
  });
});

describe("parseAdminModStatus", () => {
  it("returns published / draft as-is", () => {
    expect(parseAdminModStatus("published")).toBe("published");
    expect(parseAdminModStatus("draft")).toBe("draft");
  });

  it("falls back to all on anything else", () => {
    expect(parseAdminModStatus(undefined)).toBe("all");
    expect(parseAdminModStatus("")).toBe("all");
    expect(parseAdminModStatus("all")).toBe("all");
    expect(parseAdminModStatus("unknown")).toBe("all");
    expect(parseAdminModStatus("  ")).toBe("all");
  });
});

describe("parseAdminGameKey", () => {
  it("returns valid GameKey unchanged", () => {
    expect(parseAdminGameKey("wuthering-waves")).toBe("wuthering-waves");
    expect(parseAdminGameKey("zenless-zone-zero")).toBe("zenless-zone-zero");
    expect(parseAdminGameKey("genshin-impact")).toBe("genshin-impact");
  });

  it("returns undefined for invalid keys", () => {
    expect(parseAdminGameKey(undefined)).toBeUndefined();
    expect(parseAdminGameKey("")).toBeUndefined();
    expect(parseAdminGameKey("not-a-game")).toBeUndefined();
    expect(parseAdminGameKey("Wuthering-Waves")).toBeUndefined(); // 大小写敏感
  });
});

describe("parseAdminModsSearchParams", () => {
  it("returns defaults for empty params", () => {
    expect(parseAdminModsSearchParams({})).toEqual({ sort: "latest", status: "all" });
  });

  it("maps url params to filter keys", () => {
    const result = parseAdminModsSearchParams({
      game: "zenless-zone-zero",
      status: "draft",
      sort: "downloads",
      query: "  今汐  ",
      character: "今汐",
    });
    expect(result).toEqual({
      gameKey: "zenless-zone-zero",
      status: "draft",
      sort: "downloads",
      query: "今汐",
      character: "今汐",
    });
  });

  it("ignores bogus values", () => {
    const result = parseAdminModsSearchParams({ game: "x", status: "y", sort: "z" });
    expect(result).toEqual({
      gameKey: undefined,
      status: "all",
      sort: "latest",
    });
  });
});

// ==================== buildAdminModsHref ====================

describe("buildAdminModsHref", () => {
  it("returns bare /admin/mods when no non-default values", () => {
    expect(buildAdminModsHref({})).toBe("/admin/mods");
    // 所有字段都是默认值也不应带参数
    expect(buildAdminModsHref({ sort: "latest", status: "all" })).toBe("/admin/mods");
  });

  it("includes non-default params in fixed order: game,status,sort,query,character", () => {
    const href = buildAdminModsHref({
      gameKey: "zenless-zone-zero",
      status: "draft",
      sort: "downloads",
      query: "今汐",
      character: "长离",
    });
    expect(href).toBe(
      "/admin/mods?game=zenless-zone-zero&status=draft&sort=downloads&query=" +
        encodeURIComponent("今汐") +
        "&character=" +
        encodeURIComponent("长离"),
    );
  });

  it("omits singular default values", () => {
    expect(buildAdminModsHref({ sort: "latest" })).toBe("/admin/mods");
    expect(buildAdminModsHref({ status: "all" })).toBe("/admin/mods");
    expect(buildAdminModsHref({ gameKey: undefined })).toBe("/admin/mods");
    expect(buildAdminModsHref({ query: "" })).toBe("/admin/mods");
    expect(buildAdminModsHref({ character: undefined })).toBe("/admin/mods");
  });

  it("CJK characters survive round-trip via URLSearchParams", () => {
    const original = buildAdminModsHref({ query: "星见雅 妮可" });
    const url = new URL(original, "http://localhost");
    expect(decodeURIComponent(url.searchParams.get("query") ?? "")).toBe("星见雅 妮可");
  });

  it("single param without defaults", () => {
    expect(buildAdminModsHref({ gameKey: "wuthering-waves" })).toBe("/admin/mods?game=wuthering-waves");
    expect(buildAdminModsHref({ status: "draft" })).toBe("/admin/mods?status=draft");
    expect(buildAdminModsHref({ sort: "hot" })).toBe("/admin/mods?sort=hot");
    expect(buildAdminModsHref({ query: "abc" })).toBe("/admin/mods?query=abc");
    expect(buildAdminModsHref({ character: "今汐" })).toBe("/admin/mods?character=" + encodeURIComponent("今汐"));
  });
});

// ==================== applyAdminModsView ====================

describe("applyAdminModsView", () => {
  const mods = makeMods([
    { id: "a", title: "高下载", downloads: 200, createdAt: new Date("2026-01-01").toISOString() },
    { id: "b", title: "中下载", downloads: 100, createdAt: new Date("2026-03-01").toISOString() },
    { id: "c", title: "新发布", downloads: 50, createdAt: new Date("2026-06-01").toISOString() },
    { id: "d", title: "今汐特制", character: "今汐", downloads: 10, createdAt: new Date("2026-02-01").toISOString() },
  ]);

  it("sorts by downloads desc (tie-break createdAt desc)", () => {
    const result = applyAdminModsView(mods, { sort: "downloads" });
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by latest (createdAt desc) as default", () => {
    const result = applyAdminModsView(mods, {});
    expect(result.map((m) => m.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("sorts by latest when sort is undefined", () => {
    const result = applyAdminModsView(mods, { sort: undefined });
    expect(result.map((m) => m.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("preserves isPublished in result (AdminMod generic)", () => {
    const result = applyAdminModsView(mods, { sort: "downloads" });
    expect(result[0].isPublished).toBe(true); // 编译+运行时验证泛型保留 AdminMod 字段
  });

  it("filters by character exact match", () => {
    const result = applyAdminModsView(mods, { character: "今汐" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d");
  });

  it("filters by query keyword in title", () => {
    const result = applyAdminModsView(mods, { query: "高下载" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("hot sort weights downloads over views", () => {
    const hotMods = makeMods([
      { id: "high-dl", downloads: 1000, views: 100, createdAt: new Date("2026-01-01").toISOString() },
      { id: "high-view", downloads: 10, views: 10000, createdAt: new Date("2026-01-01").toISOString() },
    ]);
    const result = applyAdminModsView(hotMods, { sort: "hot" });
    // downloads*5=5000 >> views*0.08=800 → high-dl should rank first
    expect(result[0].id).toBe("high-dl");
  });

  it("favorites sort uses comparator from applyModSort", () => {
    const favMods = makeMods([
      { id: "low", favorites: 5, createdAt: new Date("2026-06-01").toISOString() },
      { id: "high", favorites: 50, createdAt: new Date("2026-01-01").toISOString() },
    ]);
    const result = applyAdminModsView(favMods, { sort: "favorites" });
    expect(result[0].id).toBe("high");
    expect(result[1].id).toBe("low");
  });
});

// ==================== schemas ====================

describe("adminModSortSchema", () => {
  it("accepts valid AdminModSort values", () => {
    expect(adminModSortSchema.safeParse("latest").success).toBe(true);
    expect(adminModSortSchema.safeParse("hot").success).toBe(true);
    expect(adminModSortSchema.safeParse("downloads").success).toBe(true);
    expect(adminModSortSchema.safeParse("favorites").success).toBe(true);
    expect(adminModSortSchema.safeParse("rating").success).toBe(true);
  });

  it("rejects public-only values", () => {
    // 公共 ModSort 没有 downloads
    expect(adminModSortSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("adminModStatusSchema", () => {
  it("accepts all / published / draft", () => {
    expect(adminModStatusSchema.safeParse("all").success).toBe(true);
    expect(adminModStatusSchema.safeParse("published").success).toBe(true);
    expect(adminModStatusSchema.safeParse("draft").success).toBe(true);
  });

  it("rejects random strings", () => {
    expect(adminModStatusSchema.safeParse("unknown").success).toBe(false);
    expect(adminModStatusSchema.safeParse("").success).toBe(false);
  });
});

// ==================== getAdminCharacterCounts ====================

describe("getAdminCharacterCounts", () => {
  it("counts characters from mod array", () => {
    const mods = makeMods([
      { character: "今汐" },
      { character: "长离" },
      { character: "今汐" },
      { character: "吟霖" },
    ]);
    const counts = getAdminCharacterCounts(mods);
    expect(counts["今汐"]).toBe(2);
    expect(counts["长离"]).toBe(1);
    expect(counts["吟霖"]).toBe(1);
  });

  it("returns empty record for empty array", () => {
    expect(getAdminCharacterCounts([])).toEqual({});
  });

  it("skips empty/whitespace character names", () => {
    const mods = makeMods([{ character: "" }, { character: "  " }]);
    expect(getAdminCharacterCounts(mods)).toEqual({});
  });
});
