import { describe, expect, it } from "vitest";

import { mergePagesById, uniqueById } from "./merge-pages";

const mod = (id: string) => ({ id, title: `t-${id}` });

describe("mergePagesById（无限滚动分页合并）", () => {
  it("按分页顺序拍平", () => {
    expect(mergePagesById([[mod("a"), mod("b")], [mod("c")]]).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("跨页重复的 id 只保留第一次出现的那条", () => {
    // 2026-11-03 线上实测：第 1 页与第 2 页重叠 7 条（分页缓存来自两份快照）
    const merged = mergePagesById([
      [mod("a"), mod("b"), mod("c")],
      [mod("c"), mod("a"), mod("d")],
    ]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    // 保留下来的必须是**第一页那份**对象（页面拿它的封面尺寸算版式）
    expect(merged[0]).toBe(merged.find((m) => m.id === "a"));
  });

  it("整页重复时该页一条都不新增", () => {
    const page = [mod("a"), mod("b")];
    expect(mergePagesById([page, page]).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("没有重复时原样返回（不重排）", () => {
    const pages = [[mod("a"), mod("b")], [mod("c")], []];
    expect(mergePagesById(pages).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("空输入返回空数组", () => {
    expect(mergePagesById([])).toEqual([]);
    expect(mergePagesById([[], []])).toEqual([]);
  });
});

describe("uniqueById", () => {
  it("同一条记录出现多次只留第一份", () => {
    const first = mod("a");
    const result = uniqueById([first, mod("b"), mod("a")]);
    expect(result.map((m) => m.id)).toEqual(["a", "b"]);
    expect(result[0]).toBe(first);
  });
});
