import { describe, expect, it } from "vitest";

import { resolveCommentsHttpStatus, resolveCommentsViewState } from "./comments-status";

describe("resolveCommentsHttpStatus", () => {
  // 这是本次修复的病根：200 + 空数组会让前端把「服务挂了」显示成「没有评论」
  it("降级时返回 503，而不是 200", () => {
    expect(resolveCommentsHttpStatus({ degraded: true })).toBe(503);
  });

  it("正常取到数据（哪怕结果确实是空的）返回 200", () => {
    expect(resolveCommentsHttpStatus({ degraded: false })).toBe(200);
    expect(resolveCommentsHttpStatus({})).toBe(200);
  });
});

describe("resolveCommentsViewState", () => {
  it("有内容就显示列表", () => {
    expect(resolveCommentsViewState({ itemCount: 3, failed: false })).toBe("list");
  });

  // 已经看到评论了，一次翻页失败不该整块换成错误页
  it("有内容时即使请求失败也仍然显示列表", () => {
    expect(resolveCommentsViewState({ itemCount: 3, failed: true })).toBe("list");
  });

  it("没有内容且请求失败时显示「取不到」，不是「没有评论」", () => {
    expect(resolveCommentsViewState({ itemCount: 0, failed: true })).toBe("unavailable");
  });

  it("没有内容且请求正常时才是真的没有评论", () => {
    expect(resolveCommentsViewState({ itemCount: 0, failed: false })).toBe("empty");
  });
});
