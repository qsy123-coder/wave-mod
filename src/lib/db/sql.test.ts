import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildUpdateAssignments } from "./sql";

describe("buildUpdateAssignments", () => {
  it("按字段顺序生成占位符", () => {
    expect(buildUpdateAssignments({ title: "a", is_published: true })).toEqual({
      assignments: "title = $1, is_published = $2",
      values: ["a", true],
    });
  });

  it("跳过 undefined，但保留 null / false / 0 / 空串", () => {
    expect(
      buildUpdateAssignments({
        a: undefined,
        b: null,
        c: false,
        d: 0,
        e: "",
      }),
    ).toEqual({
      assignments: "b = $1, c = $2, d = $3, e = $4",
      values: [null, false, 0, ""],
    });
  });

  it("支持自定义起始序号（用于 where id = $N）", () => {
    expect(buildUpdateAssignments({ title: "x" }, 3)).toEqual({
      assignments: "title = $3",
      values: ["x"],
    });
  });

  it("空对象返回空 assignments", () => {
    expect(buildUpdateAssignments({})).toEqual({ assignments: "", values: [] });
  });
});
