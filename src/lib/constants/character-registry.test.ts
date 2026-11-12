import { describe, expect, it } from "vitest";

import { CHARACTER_AVATARS, characters } from "./character-registry";

describe("character-registry（角色清单唯一源头）", () => {
  it("单字角色「椿」不会被长度过滤掉（2026-11-12 踩过）", () => {
    // 曾经写成 `name.length >= 2`，椿被静默剔除：前台少一个分类、
    // 后台下拉框选不到、上传时分类解析成别名 —— 全是静默的。
    expect(characters).toContain("椿");
    expect(characters).toContain("莉莉");
  });

  it("含逗号的历史别名串不进角色清单（侧栏会被渲染成一个假分类）", () => {
    expect(characters).not.toContain("滑翔翼,翱翔翼,科考摩托");
    // 但它必须还在头像表里 —— 历史数据的 character 值就是这一整串
    expect(CHARACTER_AVATARS["滑翔翼,翱翔翼,科考摩托"]).toBeTruthy();
  });

  it("角色清单从头像表派生，两者不会漂移", () => {
    const expected = Object.keys(CHARACTER_AVATARS).filter((name) => !name.includes(","));
    expect(characters).toEqual(expected);
  });

  it("每个角色都有头像路径，且都在 /character-imgs/ 下", () => {
    for (const name of characters) {
      expect(CHARACTER_AVATARS[name], name).toMatch(/^\/character-imgs\//);
    }
  });

  it("特殊分类都在（后台下拉框需要有它们）", () => {
    for (const special of ["Skins", "Other/Misc", "UI", "怪物"]) {
      expect(characters, special).toContain(special);
    }
  });

  it("没有重复角色", () => {
    expect(new Set(characters).size).toBe(characters.length);
  });
});
