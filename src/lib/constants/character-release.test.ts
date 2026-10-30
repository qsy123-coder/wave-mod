import { describe, expect, it } from "vitest";

import {
  CHARACTER_RELEASE_DATES,
  characterReleaseDate,
  compareCharactersByRelease,
  sortCharactersByRelease,
} from "./character-release";

describe("sortCharactersByRelease", () => {
  it("新角色排在前面（按首发卡池日期倒序）", () => {
    expect(sortCharactersByRelease(["千咲", "锁暝", "琳奈"])).toEqual(["锁暝", "琳奈", "千咲"]);
  });

  it("同一天开池的角色按拼音排，结果稳定", () => {
    // 1.0 首发那一批：白芷(bai) < 男漂(nan) < 女漂(nv)
    expect(sortCharactersByRelease(["女漂", "男漂", "白芷"])).toEqual(["白芷", "男漂", "女漂"]);
  });

  it("非角色分类（UI / 武器 / 怪物 / 特效桶）排在所有角色之后", () => {
    const sorted = sortCharactersByRelease(["UI", "锁暝", "武器", "怪物", "千咲"]);
    expect(sorted.slice(0, 2)).toEqual(["锁暝", "千咲"]);
    expect(sorted.slice(2).sort()).toEqual(["UI", "怪物", "武器"].sort());
  });

  it("不改入参", () => {
    const input = ["琳奈", "锁暝"];
    sortCharactersByRelease(input);
    expect(input).toEqual(["琳奈", "锁暝"]);
  });

  it("派生分类跟在对应角色旁（芙露德莉斯与卡提希娅同一天）", () => {
    const sorted = sortCharactersByRelease(["芙露德莉斯", "卡提希娅", "赞妮"]);
    // 前两格是卡提希娅那一批（同日按拼音：芙 < 卡），赞妮更早排后面
    expect(sorted.slice(0, 2).sort()).toEqual(["卡提希娅", "芙露德莉斯"].sort());
    expect(sorted[2]).toBe("赞妮");
  });
});

describe("characterReleaseDate", () => {
  it("登记过的角色返回 ISO 日期", () => {
    expect(characterReleaseDate("锁暝")).toBe("2026-10-22");
    expect(characterReleaseDate("忌炎")).toBe("2024-05-23");
  });

  it("非角色分类 / 未知名字返回 null", () => {
    expect(characterReleaseDate("UI")).toBeNull();
    expect(characterReleaseDate("不存在的角色")).toBeNull();
  });

  it("别名 陆赫斯 / 路赫斯 共用同一天", () => {
    expect(characterReleaseDate("陆赫斯")).toBe(characterReleaseDate("路赫斯"));
  });
});

describe("CHARACTER_RELEASE_DATES", () => {
  it("日期都是合法的 ISO 日期（YYYY-MM-DD）", () => {
    for (const [name, date] of Object.entries(CHARACTER_RELEASE_DATES)) {
      expect(date, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(date)), name).toBe(false);
    }
  });

  it("比较函数对同一角色返回 0", () => {
    expect(compareCharactersByRelease("锁暝", "锁暝")).toBe(0);
  });
});
