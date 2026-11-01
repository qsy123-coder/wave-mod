import { describe, expect, it } from "vitest";

import {
  dedupKey,
  extractVersion,
  resolveCanonicalKey,
  resolveCharacterAndTitle,
  stripRenameSuffix,
} from "./daily-classify.mjs";

describe("resolveCharacterAndTitle", () => {
  it("普通角色：剥掉「角色-」前缀", () => {
    expect(resolveCharacterAndTitle("绯雪-心月狐 by kuzan")).toEqual({
      character: "绯雪",
      title: "心月狐 by kuzan",
    });
  });

  it("皮肤类前缀：title 保留完整 key", () => {
    expect(resolveCharacterAndTitle("千咲皮肤[蜜桃冰]-蜜桃啵啵冰v1.1")).toEqual({
      character: "千咲",
      title: "千咲皮肤[蜜桃冰]-蜜桃啵啵冰v1.1",
    });
  });

  it("别名「心(含大招)」归心月狐（默认分支保留完整 title）", () => {
    expect(resolveCharacterAndTitle("心(含大招)-夏日丰腴女神v1.2")).toEqual({
      character: "心月狐",
      title: "心(含大招)-夏日丰腴女神v1.2",
    });
  });

  it("周本 Boss 归「怪物」，title 完整保留", () => {
    expect(resolveCharacterAndTitle("周本心月狐-艳色灼人 by 晨星")).toEqual({
      character: "怪物",
      title: "周本心月狐-艳色灼人 by 晨星",
    });
  });

  it("爱弥斯的机甲是独立分类", () => {
    expect(resolveCharacterAndTitle("爱弥斯的机甲-丰汝肥屯 by slap")).toEqual({
      character: "爱弥斯的机甲",
      title: "爱弥斯的机甲-丰汝肥屯 by slap",
    });
  });

  it("UI 前缀：索拉指南去前缀", () => {
    expect(resolveCharacterAndTitle("索拉指南-长离动态nsfw")).toEqual({
      character: "UI",
      title: "长离动态nsfw",
    });
  });

  it("武器皮归「武器」，title 完整保留", () => {
    expect(resolveCharacterAndTitle("浩境粼光-赛琳娜武器")).toEqual({
      character: "武器",
      title: "浩境粼光-赛琳娜武器",
    });
  });

  it("特效类归历史 bucket，title 完整保留", () => {
    expect(resolveCharacterAndTitle("去葫芦和葫芦光v3.7")).toEqual({
      character: "反虚化，ui界面，场景，葫芦，特效等",
      title: "去葫芦和葫芦光v3.7",
    });
  });

  it("尤诺的月环是特例", () => {
    expect(resolveCharacterAndTitle("尤诺的月环-星海")).toEqual({
      character: "尤诺",
      title: "的月环-星海",
    });
  });

  it("大卡归芙露德莉斯", () => {
    expect(resolveCharacterAndTitle("卡提希娅-大卡-神之御装")).toEqual({
      character: "芙露德莉斯",
      title: "大卡-神之御装",
    });
  });

  it("未知前缀回退成首段作为角色", () => {
    expect(resolveCharacterAndTitle("某个新角色-皮肤")).toEqual({
      character: "某个新角色",
      title: "某个新角色-皮肤",
    });
  });

  it("别名桥接后走分类", () => {
    expect(resolveCharacterAndTitle(resolveCanonicalKey("锁暝特效更改-深黑"))).toEqual({
      character: "锁暝",
      title: "锁暝-特效更改-深黑",
    });
  });
});

describe("dedupKey", () => {
  it("剥掉 title 开头重复的角色前缀", () => {
    expect(dedupKey("莫宁", "莫宁-月光幻影v3.4fix")).toBe("莫宁|月光幻影v3.4fix");
    expect(dedupKey("莫宁", "月光幻影v3.4fix")).toBe("莫宁|月光幻影v3.4fix");
  });

  it("角色不同则键不同", () => {
    expect(dedupKey("莫宁", "月光幻影")).not.toBe(dedupKey("弗洛洛", "月光幻影"));
  });
});

describe("extractVersion", () => {
  it("提取 v 版本号", () => {
    expect(extractVersion("月光幻影v3.4fix")).toBe("v3.4");
    expect(extractVersion("皮肤 V1.2")).toBe("v1.2");
  });

  it("没有版本号返回「未标注」", () => {
    expect(extractVersion("原版切换")).toBe("未标注");
  });
});

describe("stripRenameSuffix", () => {
  it("去掉行尾 (1) / （2）", () => {
    expect(stripRenameSuffix("丽贝卡-洁薇塔（90）by woju(1)")).toBe(
      "丽贝卡-洁薇塔（90）by woju",
    );
    expect(stripRenameSuffix("标题（2）")).toBe("标题");
    expect(stripRenameSuffix("标题（内附切换）")).toBe("标题（内附切换）");
  });
});
