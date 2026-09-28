import { describe, expect, it } from "vitest";

import {
  mapGamebananaMod,
  mapGamebananaModDetail,
  publicGamebananaColumns,
  toSiteMod,
} from "@/lib/gamebanana-domain/mappers";
import type { Tables } from "@/types/supabase";

type GamebananaRow = Tables<"gamebanana_mods">;

// 写全字段而不是只写几个再 as 转型：转型会让改字段时编译器不再挡你。
const BASE_ROW: GamebananaRow = {
  author_name: "somebody",
  author_url: "https://gamebanana.com/members/1",
  av_status: "File has been scanned, no malware detected",
  character: "清宵",
  cover_url: "https://images.gamebanana.com/img/ss/mods/1_800.jpg",
  created_at: "2026-09-01T00:00:00.000Z",
  description: "原始简介",
  download_count: 7,
  download_url: "https://gamebanana.com/dl/1234567",
  file_size: 3145728,
  gb_created_at: "2026-08-01T00:00:00.000Z",
  gb_id: 718362,
  gb_root_category: "Skins",
  gb_subcategory: "Wuthering Waves",
  gb_updated_at: "2026-08-02T00:00:00.000Z",
  images: ["https://images.gamebanana.com/img/ss/mods/1_530.jpg"],
  is_published: true,
  like_count: 42,
  synced_at: "2026-09-01T00:00:00.000Z",
  title: "测试搬运 MOD",
  updated_at: "2026-09-01T00:00:00.000Z",
  version: "1.2",
  view_count: 900,
  visibility: "show",
};

function makeRow(overrides: Partial<GamebananaRow> = {}): GamebananaRow {
  return { ...BASE_ROW, ...overrides };
}

/**
 * 模拟「查询里没取这一列」：类型上 `images` 是必填 `string[]`，运行时才会缺键。
 * 列表路径正是这种情况（见 publicGamebananaColumns）。
 */
function makeListRow(overrides: Partial<Record<string, unknown>> = {}) {
  const row = makeRow() as unknown as Record<string, unknown>;
  delete row.images;
  delete row.description;
  delete row.gb_root_category;
  delete row.gb_subcategory;
  return { ...row, ...overrides } as never;
}

describe("publicGamebananaColumns 列清单", () => {
  /**
   * 流量防回归护栏：列表一次下发全库（当前 288 条，跑 `--all` 后 3000+）。
   * `images` 是每行最多 8 个 URL 的数组，是这份 JSON 里最大的一块，而卡片只渲染
   * `cover_url` 一张图；`description` 实测最长 8KB，卡片同理不渲染。
   * 谁把它们加回来，这一条就必须红。
   */
  it("不含 images / description（列表不渲染它们）", () => {
    expect(publicGamebananaColumns).not.toMatch(/\bimages\b/);
    expect(publicGamebananaColumns).not.toMatch(/\bdescription\b/);
  });

  it("含 cover_url —— 排除过头会让卡片没图可显示", () => {
    expect(publicGamebananaColumns).toMatch(/\bcover_url\b/);
  });

  it("含排序与筛选真正用到的列，否则客户端算出来全是 0", () => {
    for (const col of ["like_count", "view_count", "download_count", "gb_created_at", "visibility"]) {
      expect(publicGamebananaColumns).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });
});

describe("mapGamebananaMod", () => {
  it("列表行没有相册 → images 是空数组，不是 undefined", () => {
    const mod = mapGamebananaMod(makeListRow());
    expect(mod.images).toEqual([]);
    expect(mod.coverImage).toBe(BASE_ROW.cover_url);
    expect(mod.gbId).toBe(BASE_ROW.gb_id);
  });

  it("cover_url 为空（老记录）→ 空串，让卡片走它自己的占位/重试图", () => {
    expect(mapGamebananaMod(makeListRow({ cover_url: null })).coverImage).toBe("");
  });

  it("可见性取不到认得的取值时落 hide —— 宁可多拦一条，不可漏放一条", () => {
    expect(mapGamebananaMod(makeListRow({ visibility: "show" })).visibility).toBe("show");
    expect(mapGamebananaMod(makeListRow({ visibility: "warn" })).visibility).toBe("warn");
    expect(mapGamebananaMod(makeListRow({ visibility: "hide" })).visibility).toBe("hide");
    // 将来约束被放宽 / 类型漂移时也不能漏放行
    expect(mapGamebananaMod(makeListRow({ visibility: "未知分级" })).visibility).toBe("hide");
    expect(mapGamebananaMod(makeListRow({ visibility: "" })).visibility).toBe("hide");
  });
});

describe("mapGamebananaModDetail", () => {
  it("补回列表刻意不下的相册与长文本字段", () => {
    const detail = mapGamebananaModDetail(makeRow());
    expect(detail.images).toEqual(BASE_ROW.images);
    expect(detail.description).toBe("原始简介");
    expect(detail.gbRootCategory).toBe("Skins");
    expect(detail.gbSubcategory).toBe("Wuthering Waves");
    // 其余字段仍走列表那份映射
    expect(detail.gbId).toBe(BASE_ROW.gb_id);
    expect(detail.likeCount).toBe(42);
  });

  /**
   * 兜底快照刻意不下发 description（占 payload 最大一块，而详情页不渲染它）。
   * 那条路上这个键是**缺失**，不是 null —— 缺键在 JS 里读出来是 undefined，
   * 而类型写的是 `string | null`，不兜一下就是拿 undefined 冒充合法取值。
   */
  it("行里没有 description 键时落 null（网关被锁时期的兜底路径）", () => {
    const row = makeRow() as unknown as Record<string, unknown>;
    delete row.description;
    expect(mapGamebananaModDetail(row as never).description).toBeNull();
  });
});

describe("toSiteMod（复用站内 ModCard 的适配层）", () => {
  it("id 用 gbId 的字符串形式，不是 uuid", () => {
    expect(toSiteMod(mapGamebananaMod(makeListRow())).id).toBe("718362");
  });

  it("没有国内网盘：driveLinks 为空 → 卡片不会渲染网盘按钮", () => {
    expect(toSiteMod(mapGamebananaMod(makeListRow())).driveLinks).toEqual([]);
  });

  it("把平台计数映射到卡片用的字段上", () => {
    const site = toSiteMod(mapGamebananaMod(makeListRow()));
    expect(site.likes).toBe(42);
    expect(site.views).toBe(900);
    expect(site.downloads).toBe(7);
    expect(site.downloadUrl).toBe(BASE_ROW.download_url);
  });

  it("hide 视为 NSFW；show/warn 都不是", () => {
    expect(toSiteMod(mapGamebananaMod(makeListRow({ visibility: "hide" }))).nsfw).toBe(true);
    expect(toSiteMod(mapGamebananaMod(makeListRow({ visibility: "warn" }))).nsfw).toBe(false);
  });

  it("没接的交互字段一律 0，且 card 上对应的展示位必须被关掉（见 toSiteMod 注释）", () => {
    const site = toSiteMod(mapGamebananaMod(makeListRow()));
    expect(site.favorites).toBe(0);
    expect(site.commentsCount).toBe(0);
    expect(site.ratingAverage).toBe(0);
    expect(site.ratingCount).toBe(0);
    expect(site.isFeatured).toBe(false);
  });

  it("版本缺失落「未标注」，与站内 mods 表同一个占位值", () => {
    expect(toSiteMod(mapGamebananaMod(makeListRow({ version: null }))).version).toBe("未标注");
    expect(toSiteMod(mapGamebananaMod(makeListRow({ version: "2.0" }))).version).toBe("2.0");
  });
});
