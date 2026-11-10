import { describe, expect, it } from "vitest";

import { filterCharacterPickerItems, normalizeCharacterSearchQuery } from "./character-picker-filter";

/** 与真实抽屉同一批口径：3 个特殊分类 + 普通角色 + 多字归类名 */
const items = [
  { label: "Skins" },
  { label: "Other/Misc" },
  { label: "UI" },
  { label: "千咲" },
  { label: "爱弥斯" },
  { label: "滑翔翼,翱翔翼,科考摩托" },
  { label: "秋水" },
];

const labelsOf = (list: { label: string }[]) => list.map((item) => item.label);

describe("filterCharacterPickerItems", () => {
  it("空查询返回全部条目，并保持原顺序", () => {
    expect(labelsOf(filterCharacterPickerItems(items, ""))).toEqual(labelsOf(items));
  });

  it("只有空白的查询等同于空查询（常见于误触空格）", () => {
    expect(labelsOf(filterCharacterPickerItems(items, "   "))).toEqual(labelsOf(items));
  });

  it("英文分类名大小写不敏感", () => {
    expect(labelsOf(filterCharacterPickerItems(items, "skins"))).toEqual(["Skins"]);
    expect(labelsOf(filterCharacterPickerItems(items, "SKINS"))).toEqual(["Skins"]);
  });

  it("中文按子串命中（角色名不需要输全）", () => {
    expect(labelsOf(filterCharacterPickerItems(items, "千咲"))).toEqual(["千咲"]);
    expect(labelsOf(filterCharacterPickerItems(items, "咲"))).toEqual(["千咲"]);
  });

  it("多字归类名可以按其中一段命中", () => {
    expect(labelsOf(filterCharacterPickerItems(items, "摩托"))).toEqual(["滑翔翼,翱翔翼,科考摩托"]);
  });

  it("忽略查询前后的空格", () => {
    expect(labelsOf(filterCharacterPickerItems(items, "  千咲  "))).toEqual(["千咲"]);
  });

  it("全角字母先归一化再比较（手机输入法常打出全角）", () => {
    expect(labelsOf(filterCharacterPickerItems(items, "ｓｋｉｎｓ"))).toEqual(["Skins"]);
  });

  it("无匹配时返回空数组", () => {
    expect(filterCharacterPickerItems(items, "不存在的角色")).toEqual([]);
  });

  it("不修改入参，且始终返回新数组", () => {
    const snapshot = items.map((item) => item.label);

    const empty = filterCharacterPickerItems(items, "");
    const matched = filterCharacterPickerItems(items, "千咲");

    expect(items.map((item) => item.label)).toEqual(snapshot);
    expect(empty).not.toBe(items);
    expect(matched).not.toBe(items);
  });
});

describe("normalizeCharacterSearchQuery", () => {
  it("去首尾空格、转小写、做 NFKC 归一化", () => {
    expect(normalizeCharacterSearchQuery("  ＳＫＩＮＳ  ")).toBe("skins");
  });
});
