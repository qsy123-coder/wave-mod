import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODS_FILTERS,
  isDefaultModsFilters,
  modsListingKey,
  parseModsFilters,
} from "@/lib/mods-domain/filter-params";

/** 用 URLSearchParams 代替 useSearchParams()（两者的 get 形状一致） */
const parse = (qs: string) => parseModsFilters(new URLSearchParams(qs));

describe("parseModsFilters", () => {
  it("空 URL 解析出默认筛选", () => {
    expect(parse("")).toEqual(DEFAULT_MODS_FILTERS);
  });

  // ?sort=latest 与不写 sort 是同一个页面（buildModsFilterHref 会省略它），
  // 解析结果必须一致，否则同一个页面会在「播种 / 不播种」之间跳。
  it("显式 ?sort=latest 与省略 sort 等价", () => {
    expect(parse("sort=latest")).toEqual(DEFAULT_MODS_FILTERS);
  });

  it("不认识的值退回默认（sort 乱写 = latest，flag 乱写 = 关）", () => {
    expect(parse("sort=nonsense").sort).toBe("latest");
    expect(parse("direct=maybe").direct).toBe(false);
    expect(parse("preview=0").preview).toBe(false);
  });

  it("两个开关只认 1 与 true（大小写、空白都容忍）", () => {
    expect(parse("direct=1").direct).toBe(true);
    expect(parse("direct=TRUE").direct).toBe(true);
    expect(parse("preview=1&direct=1")).toMatchObject({ direct: true, preview: true });
  });

  it("character / query 去空白，纯空白当作没有", () => {
    expect(parse("character=%20%E5%8D%83%E5%92%B2%20").character).toBe("千咲");
    expect(parse("character=%20%20").character).toBeUndefined();
    expect(parse("query=%20abc%20").query).toBe("abc");
    expect(parse("query=").query).toBeUndefined();
  });
});

describe("isDefaultModsFilters", () => {
  it("默认筛选为真", () => {
    expect(isDefaultModsFilters(DEFAULT_MODS_FILTERS)).toBe(true);
    expect(isDefaultModsFilters(parse(""))).toBe(true);
  });

  // 这是播种逻辑的闸门：任何一个维度被筛选，就不能用预渲染的种子。
  it("任一维度被筛选即为假", () => {
    expect(isDefaultModsFilters(parse("character=%E5%8D%83%E5%92%B2"))).toBe(false);
    expect(isDefaultModsFilters(parse("query=abc"))).toBe(false);
    expect(isDefaultModsFilters(parse("direct=1"))).toBe(false);
    expect(isDefaultModsFilters(parse("preview=1"))).toBe(false);
  });

  // ?sort=default 是「按标题排序」，不是默认筛选 —— 误判会让种子以错误的顺序显示。
  it("sort=default 不是默认筛选（它按标题排，与 latest 是不同结果）", () => {
    expect(isDefaultModsFilters(parse("sort=default"))).toBe(false);
    expect(isDefaultModsFilters(parse("sort=hot"))).toBe(false);
  });
});

/**
 * 这个键是网格「要不要滚回顶部」的唯一判据，两个方向都会出用户可见的错：
 * 该同不同 ⇒ 点等价 URL 把用户从位置上拽回顶部；该异不同 ⇒ 换了分类还停在旧位置。
 */
describe("modsListingKey", () => {
  it("等价 URL 给同一个键（?sort=latest 与不写 sort）", () => {
    expect(modsListingKey(parse("sort=latest"))).toBe(modsListingKey(parse("")));
  });

  it("任一维度变了就是另一个键", () => {
    const base = modsListingKey(parse(""));
    for (const qs of ["character=%E5%8D%83%E5%92%B2", "query=abc", "direct=1", "preview=1", "sort=default"]) {
      expect(modsListingKey(parse(qs))).not.toBe(base);
    }
  });

  // 用 join("|") 拼字符串就会在这里撞键：值本身带分隔符时，两份不同的筛选拼出同一个串。
  it("值里的分隔符不会造成碰撞", () => {
    expect(modsListingKey(parse("character=a%7Cb"))).not.toBe(modsListingKey(parse("character=a&query=b")));
  });
});
