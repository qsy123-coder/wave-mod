import { describe, expect, it } from "vitest";

import glossary from "../data/glossary.json";
import { composeKey, extractHotkeys, sanitizeName, splitAuthor, translate } from "./naming.mjs";

describe("translate（韩语 → 站内角色与名称）", () => {
  it("多角色合集：按出现顺序收集角色，皮肤词翻成中文", () => {
    const s = translate("금희,음림,카멜리아 팬스좌 UHD", glossary);
    expect(s.characters).toEqual(["今汐", "吟霖", "椿"]);
    expect(s.name).toBe("粉丝福利 UHD");
    expect(s.confidence).toBe("high");
  });

  it("同一角色出现两次只保留一个", () => {
    const s = translate("금희 유료스킨 카노우사쿠라 화이트", glossary);
    expect(s.characters).toEqual(["今汐"]);
    expect(s.name).toContain("狩野樱");
    expect(s.name).toContain("白");
  });

  it("没翻干净的韩文会被标成低置信度（界面标黄）", () => {
    const s = translate("어흐의별자리", glossary);
    expect(s.characters).toEqual(["心月狐"]);
    expect(s.leftover.length).toBeGreaterThan(0);
    expect(s.confidence).toBe("low");
  });

  it("后缀 `by 作者` 会拆出来，并从名称里去掉", () => {
    const s = translate("쇄명 컬러변경 모드 쓰시는분들 by 브륜힐드", glossary);
    expect(s.author).toBe("브륜힐드");
    expect(s.name).not.toContain("by");
  });

  it("文件里认不出角色时，用来源站分类兜底（GameBanana 的 Danjin）", () => {
    const s = translate("【Merge整合】LongHair + Longyan (長髮+胧嫣)", glossary, { subcategory: "Danjin" });
    expect(s.characters).toEqual(["丹瑾"]);
    expect(s.name).toBe("【Merge整合】LongHair + Longyan（長髮+胧嫣）");
  });

  it("GameBanana 复合子分类精确匹配优先于标题里的英文角色名", () => {
    // 2026-11-01 用户确认：这两条是玄翎，不是秧秧
    for (const raw of ["Yangyang SP as Ramielle Dan(ZZZ)", "Sol Badguy Yangyang"]) {
      const s = translate(raw, glossary, { subcategory: "Yangyang: Xuanling" });
      expect(s.characters).toEqual(["玄翎"]);
      expect(s.name).toBe(raw.replace(/\(/g, "（").replace(/\)/g, "）"));
    }
  });
});

describe("辅助函数", () => {
  it("splitAuthor 只在结尾、且作者里没有括号时认", () => {
    expect(splitAuthor("A by 空心入梦")).toEqual({ text: "A", author: "空心入梦" });
    expect(splitAuthor("A (by X)")).toEqual({ text: "A (by X)", author: "" });
  });

  it("extractHotkeys 只认明显是热键的括号", () => {
    expect(extractHotkeys("锁暝-特效（890上下左右）")).toEqual({ text: "锁暝-特效", hotkeys: "890上下左右" });
    expect(extractHotkeys("LongHair (長髮+胧嫣)")).toEqual({ text: "LongHair (長髮+胧嫣)", hotkeys: "" });
  });

  it("sanitizeName 把半角斜杠换成全角，非法字符换成 -", () => {
    expect(sanitizeName("长离/珂莱塔")).toBe("长离／珂莱塔");
    expect(sanitizeName('a:b*c?"d"')).toBe("a-b-c--d");
  });

  it("composeKey 拼出 `<角色>-<名称>（切换键）by <作者>`", () => {
    expect(
      composeKey({ characters: ["今汐"], name: "粉丝福利UHD（丝袜黑）", hotkeys: "", author: "문지기" })
    ).toBe("今汐-粉丝福利UHD（丝袜黑） by 문지기");
    expect(composeKey({ characters: ["锁暝"], name: "特效更改", hotkeys: "890", author: "" })).toBe(
      "锁暝-特效更改（890）"
    );
  });
});
