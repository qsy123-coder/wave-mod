import { describe, expect, it } from "vitest";

import { buildCharacterAllowlist } from "./character-allowlist.mjs";

const normalize = (value) => (value === "陆赫斯" ? "路赫斯" : value);

describe("buildCharacterAllowlist", () => {
  it("新角色在站内登记表里、库内还没有 ⇒ 算合法（莉莉的鸡生蛋问题）", () => {
    const allowlist = buildCharacterAllowlist({
      dbCharacters: ["今汐", "长离"],
      registeredCharacters: ["今汐", "长离", "莉莉"],
    });

    // 这正是 2026-11-12 的场景：库内 0 条莉莉，但代码里已登记，工坊必须放行
    expect(allowlist.has("莉莉")).toBe(true);
    expect(allowlist.has("今汐")).toBe(true);
    expect(allowlist.size).toBe(3);
  });

  it("库内独有、站内角色表没有的分类也保留（武器 / 怪物 / 历史别名串）", () => {
    const allowlist = buildCharacterAllowlist({
      dbCharacters: ["武器", "怪物", "滑翔翼,翱翔翼,科考摩托", "莉莉"],
      registeredCharacters: ["今汐"],
    });

    expect(allowlist.has("武器")).toBe(true);
    expect(allowlist.has("怪物")).toBe(true);
    expect(allowlist.has("滑翔翼,翱翔翼,科考摩托")).toBe(true);
    expect(allowlist.size).toBe(5);
  });

  it("归一化在入集合前生效，别名不会成为第二个分类", () => {
    const allowlist = buildCharacterAllowlist({
      dbCharacters: ["陆赫斯"],
      registeredCharacters: ["路赫斯"],
      normalize,
    });

    expect(allowlist.has("路赫斯")).toBe(true);
    expect(allowlist.has("陆赫斯")).toBe(false);
    expect(allowlist.size).toBe(1);
  });

  it("读库失败但站内登记表在 ⇒ 仍然返回集合，不退化成未校验", () => {
    const allowlist = buildCharacterAllowlist({
      dbCharacters: null,
      registeredCharacters: ["莉莉"],
    });

    expect(allowlist).not.toBeNull();
    expect(allowlist.has("莉莉")).toBe(true);
  });

  it("两边都拿不到 ⇒ 返回 null（调用方降级成「未校验」而不是「全部非法」）", () => {
    expect(buildCharacterAllowlist({ dbCharacters: null, registeredCharacters: null })).toBeNull();
    expect(buildCharacterAllowlist({})).toBeNull();
  });

  it("空串与空白被丢掉，不会造出空分类", () => {
    const allowlist = buildCharacterAllowlist({
      dbCharacters: ["", "  ", "今汐"],
      registeredCharacters: [null, "长离"],
    });

    expect(allowlist.has("")).toBe(false);
    expect([...allowlist].sort()).toEqual(["今汐", "长离"].sort());
  });

  it("不修改入参（调用方传的是库缓存里的数组）", () => {
    const dbCharacters = ["今汐"];
    buildCharacterAllowlist({ dbCharacters, registeredCharacters: ["长离"] });
    expect(dbCharacters).toEqual(["今汐"]);
  });
});
