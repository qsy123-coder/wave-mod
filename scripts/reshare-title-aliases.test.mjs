/**
 * 重分享别名表的单测。
 *
 * 失败模式和 daka-classify 一样是静默的：别名写错 ⇒ 去重键对不上 ⇒ 要么重复入库、
 * 要么链接永远更新不到。所以逐条锁住。
 */
import { describe, expect, it } from "vitest";

import { RESHARE_ALIASES, resolveReshareAlias } from "./reshare-title-aliases.mjs";

describe("resolveReshareAlias", () => {
  it("命中时返回库内 title（2026-10-23 珂莱塔重分享）", () => {
    expect(resolveReshareAlias("珂莱塔-罪恶之夏（890）by woju")).toEqual({
      character: "珂莱塔",
      title: "罪恶之夏 by woju（890切换）",
    });
    expect(resolveReshareAlias("珂莱塔-花阴（890】）by woju")).toEqual({
      character: "珂莱塔",
      title: "花阴 by woju（890】切换）",
    });
    expect(resolveReshareAlias("珂莱塔-洁塔薇（0）by Actice")).toEqual({
      character: "珂莱塔",
      title: "洁塔薇 by Actice（0切换）",
    });
    expect(resolveReshareAlias("珂莱塔-缪泽(左右）by 阿鲁提亚")).toEqual({
      character: "珂莱塔",
      title: "缪泽 by 阿鲁提亚",
    });
    expect(resolveReshareAlias("珂莱塔-吸血鬼-白-斑点袜（上下左右）og 狩野樱")).toEqual({
      character: "珂莱塔",
      title: "吸血鬼-白-斑点袜 og 狩野樱（上下左右切换）",
    });
  });

  it("莫宁 月光幻影 不再是别名：库内 title 已改成文件名原样（2026-10-30）", () => {
    expect(resolveReshareAlias("莫宁-月光幻影v3.4fix by Alunoop（ctrl+4567890切换）")).toBeNull();
  });

  it("未登记的 key 返回 null，不做模糊猜测", () => {
    expect(resolveReshareAlias("珂莱塔-罪恶之夏-多色切换（890）by woju")).toBeNull();
    expect(resolveReshareAlias("珂莱塔-花阴（890）by woju")).toBeNull();
    expect(resolveReshareAlias("")).toBeNull();
    expect(resolveReshareAlias(undefined)).toBeNull();
  });

  it("别名不会自我循环：title 不等于 key", () => {
    for (const [key, value] of RESHARE_ALIASES) {
      expect(value.title).not.toBe(key);
      expect(value.character.trim()).not.toBe("");
      expect(value.title.trim()).not.toBe("");
    }
  });
});
