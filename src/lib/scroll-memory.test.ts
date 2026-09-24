import { describe, expect, it } from "vitest";

import { recallScrollPosition, rememberScrollPosition } from "@/lib/scroll-memory";

/**
 * 这个模块存在的唯一理由见文件头注释：列表子树会被 Suspense 边界整体换掉，
 * 侧栏的滚动位置只能靠模块作用域记着。用例只守两件事：
 *   1. 记过就取得回 —— 这就是修复本身；
 *   2. 没记过返回 0、脏值写不进去 —— 否则侧栏会凭空跳到某个位置（比归零更糟）。
 */
describe("滚动位置记忆", () => {
  it("记下之后取得回同一个值", () => {
    rememberScrollPosition("用例-基础", 400);
    expect(recallScrollPosition("用例-基础")).toBe(400);
  });

  it("键之间互不干扰", () => {
    rememberScrollPosition("用例-甲", 120);
    rememberScrollPosition("用例-乙", 0);
    expect(recallScrollPosition("用例-甲")).toBe(120);
    expect(recallScrollPosition("用例-乙")).toBe(0);
  });

  it("没记过的键返回 0", () => {
    expect(recallScrollPosition("用例-从没记过")).toBe(0);
  });

  it("NaN / 负数 / Infinity 不写入，保留上一次的有效值", () => {
    rememberScrollPosition("用例-脏值", 250);
    rememberScrollPosition("用例-脏值", Number.NaN);
    rememberScrollPosition("用例-脏值", -10);
    rememberScrollPosition("用例-脏值", Number.POSITIVE_INFINITY);
    expect(recallScrollPosition("用例-脏值")).toBe(250);
  });
});
