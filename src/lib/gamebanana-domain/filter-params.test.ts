import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAMEBANANA_FILTERS,
  applyGamebananaFilters,
  buildGamebananaHref,
  gamebananaListingKey,
  isDefaultGamebananaFilters,
  parseGamebananaFilters,
  parseGamebananaGbId,
  type GamebananaFilters,
} from "@/lib/gamebanana-domain/filter-params";
import type { GamebananaMod } from "@/lib/gamebanana-domain/types";

/** 造一个满足类型的最小 mod，只覆盖被测字段 */
function mod(over: Partial<GamebananaMod> & { gbId: number }): GamebananaMod {
  return {
    title: `mod ${over.gbId}`,
    character: "清宵",
    authorName: null,
    authorUrl: null,
    coverImage: "https://images.gamebanana.com/x.jpg",
    images: [],
    version: null,
    visibility: "show",
    downloadUrl: "https://gamebanana.com/dl/1",
    fileSize: null,
    avStatus: null,
    likeCount: 0,
    viewCount: 0,
    downloadCount: 0,
    gbCreatedAt: null,
    ...over,
  };
}

/** 把普通对象包成 URLSearchParams 的形状（与 useSearchParams 同构） */
const search = (q: Record<string, string>) => new URLSearchParams(q);

describe("parseGamebananaFilters", () => {
  it("空 URL → 默认筛选", () => {
    expect(parseGamebananaFilters(search({}))).toEqual(DEFAULT_GAMEBANANA_FILTERS);
  });

  it("解析各字段", () => {
    const f = parseGamebananaFilters(search({ sort: "views", character: "清宵", query: "dress", nsfw: "1" }));
    expect(f).toEqual({ sort: "views", character: "清宵", query: "dress", nsfw: true });
  });

  it("非法 sort 退回默认，而不是把整页打崩", () => {
    expect(parseGamebananaFilters(search({ sort: "DROP TABLE" })).sort).toBe(DEFAULT_GAMEBANANA_FILTERS.sort);
  });

  it("空白的 character / query 视同没传", () => {
    const f = parseGamebananaFilters(search({ character: "   ", query: "" }));
    expect(f.character).toBeUndefined();
    expect(f.query).toBeUndefined();
  });

  it("nsfw 只认 1/true，别的一律当关（宁可少放行）", () => {
    for (const v of ["1", "true"]) expect(parseGamebananaFilters(search({ nsfw: v })).nsfw).toBe(true);
    for (const v of ["0", "false", "yes", "", "2"]) {
      expect(parseGamebananaFilters(search({ nsfw: v })).nsfw).toBe(false);
    }
  });

  it("超长 query 被截断，不把一个 10 万字的串带进筛选与键", () => {
    const f = parseGamebananaFilters(search({ query: "a".repeat(100_000) }));
    expect(f.query?.length).toBeLessThanOrEqual(100);
  });
});

describe("isDefaultGamebananaFilters", () => {
  it("默认那份为 true", () => {
    expect(isDefaultGamebananaFilters(DEFAULT_GAMEBANANA_FILTERS)).toBe(true);
  });

  it("任一维度变了就不是默认 —— 决定预渲染种子能不能用", () => {
    expect(isDefaultGamebananaFilters({ ...DEFAULT_GAMEBANANA_FILTERS, sort: "latest" })).toBe(false);
    expect(isDefaultGamebananaFilters({ ...DEFAULT_GAMEBANANA_FILTERS, character: "清宵" })).toBe(false);
    expect(isDefaultGamebananaFilters({ ...DEFAULT_GAMEBANANA_FILTERS, query: "x" })).toBe(false);
    expect(isDefaultGamebananaFilters({ ...DEFAULT_GAMEBANANA_FILTERS, nsfw: true })).toBe(false);
  });
});

describe("gamebananaListingKey", () => {
  it("等价的筛选给同一个键（用于判断要不要把滚动位置归零）", () => {
    const a: GamebananaFilters = { sort: "hot", nsfw: false };
    const b: GamebananaFilters = { sort: "hot", nsfw: false };
    expect(gamebananaListingKey(a)).toBe(gamebananaListingKey(b));
  });

  it("不同筛选给不同的键", () => {
    expect(gamebananaListingKey({ sort: "hot", nsfw: false })).not.toBe(
      gamebananaListingKey({ sort: "hot", nsfw: true })
    );
  });

  it("不靠 join 拼串：值里带分隔符的两个不同筛选不能撞键", () => {
    const a: GamebananaFilters = { sort: "hot", nsfw: false, query: "a", character: "b" };
    const b: GamebananaFilters = { sort: "hot", nsfw: false, query: "a|b" };
    expect(gamebananaListingKey(a)).not.toBe(gamebananaListingKey(b));
  });
});

describe("applyGamebananaFilters", () => {
  const list = [
    mod({ gbId: 1, character: "清宵", likeCount: 5, viewCount: 100, downloadCount: 9, gbCreatedAt: "2026-01-01T00:00:00Z", title: "Qingxiao Dress" }),
    mod({ gbId: 2, character: "绯雪", likeCount: 50, viewCount: 10, downloadCount: 1, gbCreatedAt: "2026-03-01T00:00:00Z", title: "Hiyuki Bun" }),
    mod({ gbId: 3, character: "清宵", likeCount: 20, viewCount: 500, downloadCount: 99, gbCreatedAt: "2026-02-01T00:00:00Z", title: "Thicc", visibility: "hide" }),
  ];

  it("默认排除 hide —— 那是 NSFW，不该出现在默认列表里", () => {
    const got = applyGamebananaFilters(list, DEFAULT_GAMEBANANA_FILTERS);
    expect(got.map((m) => m.gbId).sort()).toEqual([1, 2]);
  });

  it("显式打开 nsfw 才带上 hide", () => {
    const got = applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, nsfw: true });
    expect(got.map((m) => m.gbId).sort()).toEqual([1, 2, 3]);
  });

  it("warn 属于默认可见（只需提示，不是禁止）", () => {
    const withWarn = [...list, mod({ gbId: 4, visibility: "warn" })];
    expect(applyGamebananaFilters(withWarn, DEFAULT_GAMEBANANA_FILTERS).map((m) => m.gbId)).toContain(4);
  });

  it("hot = 点赞降序", () => {
    const got = applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, sort: "hot" });
    expect(got.map((m) => m.gbId)).toEqual([2, 1]);
  });

  it("views / downloads 各自降序", () => {
    // 默认排除 hide，所以 3（views 最高但 hide）不参与排序
    expect(applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, sort: "views" }).map((m) => m.gbId)).toEqual([1, 2]);
    expect(applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, sort: "downloads" }).map((m) => m.gbId)).toEqual([1, 2]);
  });

  it("latest = 加入时间倒序，且缺日期的排最后（不抛错）", () => {
    const withNull = [...list, mod({ gbId: 5, gbCreatedAt: null })];
    expect(applyGamebananaFilters(withNull, { ...DEFAULT_GAMEBANANA_FILTERS, sort: "latest" }).map((m) => m.gbId)).toEqual([2, 1, 5]);
  });

  it("character 精确匹配（不是包含）", () => {
    const got = applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, character: "清宵" });
    expect(got.map((m) => m.gbId)).toEqual([1]);
  });

  it("query 对标题做大小写不敏感的子串匹配", () => {
    expect(applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, query: "dress" }).map((m) => m.gbId)).toEqual([1]);
    expect(applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, query: "THICC" }).map((m) => m.gbId)).toEqual([]);
  });

  it("多个条件是与关系", () => {
    const got = applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, character: "清宵", query: "dress" });
    expect(got.map((m) => m.gbId)).toEqual([1]);
  });

  it("不改动入参数组（纯函数）", () => {
    const before = list.map((m) => m.gbId);
    applyGamebananaFilters(list, { ...DEFAULT_GAMEBANANA_FILTERS, sort: "views" });
    expect(list.map((m) => m.gbId)).toEqual(before);
  });
});

describe("buildGamebananaHref", () => {
  const base: GamebananaFilters = { sort: "hot", nsfw: false };

  it("默认筛选 → 干净的 /gamebanana（不写冗余参数）", () => {
    expect(buildGamebananaHref(base, {})).toBe("/gamebanana");
  });

  it("改排序时保留已选角色 —— 否则点排序会把用户的筛选清掉", () => {
    const href = buildGamebananaHref({ sort: "hot", nsfw: false, character: "清宵" }, { sort: "views" });
    // 不硬写百分号编码：手抄码位错过一次（霄/宵），拼出来读起来也知道在断言什么
    expect(href).toBe(`/gamebanana?sort=views&character=${encodeURIComponent("清宵")}`);
    // 反向也要成立
    expect(buildGamebananaHref({ sort: "views", nsfw: false, character: "清宵" }, { character: undefined })).toBe(
      "/gamebanana?sort=views"
    );
  });

  it("清空字段后不残留空参数", () => {
    expect(buildGamebananaHref({ sort: "hot", nsfw: false, query: "x" }, { query: undefined })).toBe("/gamebanana");
  });

  it("nsfw 用 1 表示，关掉时该参数消失", () => {
    expect(buildGamebananaHref(base, { nsfw: true })).toBe("/gamebanana?nsfw=1");
    expect(buildGamebananaHref({ sort: "hot", nsfw: true }, { nsfw: false })).toBe("/gamebanana");
  });

  it("输出相对路径 —— 站点有备用域名入口，绝对不能拼绝对地址", () => {
    expect(buildGamebananaHref(base, { sort: "views" }).startsWith("/")).toBe(true);
  });

  it("与 parse 互为逆运算：构造出来的链接解析回去就是同一份筛选", () => {
    const filters: GamebananaFilters = { sort: "downloads", character: "绯雪", query: "bun", nsfw: true };
    const href = buildGamebananaHref(DEFAULT_GAMEBANANA_FILTERS, filters);
    const qs = href.slice(href.indexOf("?") + 1);
    expect(parseGamebananaFilters(new URLSearchParams(qs))).toEqual(filters);
  });
});

describe("parseGamebananaGbId", () => {
  it("正常数字 → number", () => {
    expect(parseGamebananaGbId("695030")).toBe(695030);
    expect(parseGamebananaGbId("1")).toBe(1);
  });

  it("前导零照收（Number 归一化）", () => {
    expect(parseGamebananaGbId("007")).toBe(7);
  });

  it("0 与负数不收（gb_id 是自增主键，从 1 起）", () => {
    expect(parseGamebananaGbId("0")).toBeNull();
    expect(parseGamebananaGbId("-5")).toBeNull();
  });

  it("非纯数字写法一律不收 —— 别把「1e3」「0x1F」这类交给 PostgREST 去解释", () => {
    expect(parseGamebananaGbId("1e3")).toBeNull();
    expect(parseGamebananaGbId("0x1F")).toBeNull();
    expect(parseGamebananaGbId(" 12")).toBeNull();
    expect(parseGamebananaGbId("12 ")).toBeNull();
    expect(parseGamebananaGbId("+12")).toBeNull();
    expect(parseGamebananaGbId("12.0")).toBeNull();
    expect(parseGamebananaGbId("abc")).toBeNull();
    expect(parseGamebananaGbId("")).toBeNull();
  });

  it("小数与 Infinity 不收", () => {
    expect(parseGamebananaGbId("1.5")).toBeNull();
    expect(parseGamebananaGbId("Infinity")).toBeNull();
  });

  it("12 位收，13 位不收", () => {
    expect(parseGamebananaGbId("1".repeat(12))).toBe(Number("1".repeat(12)));
    expect(parseGamebananaGbId("1".repeat(13))).toBeNull();
  });

  it("与 String() 互逆 —— 抽屉就是拿 gbId 拼出 /api/gamebanana/<id> 再解析回来的", () => {
    for (const gbId of [1, 42, 695030, 999999999999]) {
      expect(parseGamebananaGbId(String(gbId))).toBe(gbId);
    }
  });
});
