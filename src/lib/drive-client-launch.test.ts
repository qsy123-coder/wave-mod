import { describe, expect, it } from "vitest";

import {
  hasLaunched,
  LAUNCH_MEMORY_LIMIT,
  launchMemoryKey,
  rememberLaunched,
} from "./drive-client-launch";

/** 用内存对象冒充 sessionStorage —— 这里测的是去重逻辑，不需要真浏览器 */
function fakeStorage(): Pick<Storage, "getItem" | "setItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("launchMemoryKey：去重是按网盘，不是按链接", () => {
  it("同一个网盘的不同 mod、不同链接 → 同一个 key（换了链接也不再抢前台）", () => {
    expect(launchMemoryKey("夸克网盘")).toBe(launchMemoryKey("夸克"));
    expect(launchMemoryKey("Quark")).toBe(launchMemoryKey("夸克网盘"));
    expect(launchMemoryKey("迅雷网盘")).toBe(launchMemoryKey("迅雷"));
  });

  it("不同网盘是不同的 key（夸克开过了不影响迅雷）", () => {
    expect(launchMemoryKey("夸克网盘")).not.toBe(launchMemoryKey("迅雷网盘"));
  });

  it("没有客户端的平台没有 key —— 它们压根不会进这张表", () => {
    for (const platform of ["百度网盘", "阿里云盘", "蓝奏云", ""]) {
      expect(launchMemoryKey(platform)).toBeNull();
    }
  });
});

// 下面测的是「记得住/记得准」这套存储原语，键是什么由调用方决定（现实里传的是网盘种类，见上）
describe("唤起记忆：记过的键认得出，没记过的认不出", () => {
  it("没记过就是没唤起过", () => {
    expect(hasLaunched(fakeStorage(), "quark")).toBe(false);
  });

  it("记过之后认得出来，且不影响别的键", () => {
    const storage = fakeStorage();
    rememberLaunched(storage, "quark");

    expect(hasLaunched(storage, "quark")).toBe(true);
    expect(hasLaunched(storage, "xunlei")).toBe(false);
  });

  it("存储不可用（隐私模式/禁用存储）时不抛，且退化成「每次都唤起」而不是永不唤起", () => {
    // 宁可多唤起一次，也不能因为存不了就再也不唤起 —— 那功能就整个没了
    expect(hasLaunched(null, "quark")).toBe(false);
    expect(() => rememberLaunched(null, "quark")).not.toThrow();
  });

  it("存储里是坏数据时当作没记过，不能把唤起整个卡死", () => {
    const broken = { getItem: () => "{这不是数组", setItem: () => {} };
    expect(hasLaunched(broken, "quark")).toBe(false);
  });

  it("读出非数组也不炸（历史数据/被其他代码写脏）", () => {
    const notArray = { getItem: () => '{"a":1}', setItem: () => {} };
    expect(hasLaunched(notArray, "quark")).toBe(false);
  });

  it("记满上限就丢最旧的，不会无限增长", () => {
    const storage = fakeStorage();
    for (let i = 0; i < LAUNCH_MEMORY_LIMIT + 10; i += 1) {
      rememberLaunched(storage, `drive-${i}`);
    }

    expect(hasLaunched(storage, `drive-${LAUNCH_MEMORY_LIMIT + 9}`)).toBe(true);
    expect(hasLaunched(storage, "drive-0")).toBe(false);
  });

  it("重复记同一个键只占一格 —— 否则会被自己挤掉，又被反复唤起", () => {
    const storage = fakeStorage();
    for (let i = 0; i < 3; i += 1) rememberLaunched(storage, "quark");
    // 再记 N-1 条不同的：去重生效的话 "quark" 正好还在上限内；存了三份的话早被挤出去了
    for (let i = 0; i < LAUNCH_MEMORY_LIMIT - 1; i += 1) {
      rememberLaunched(storage, `other-${i}`);
    }

    expect(hasLaunched(storage, "quark")).toBe(true);
  });
});
