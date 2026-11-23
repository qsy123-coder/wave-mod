import { describe, expect, it } from "vitest";

import { buildQuestionShareUrl, parseQuestionHash, questionHash } from "./question-anchor";

describe("questionHash", () => {
  it("把 Q 编号转成小写锚点", () => {
    expect(questionHash("Q1")).toBe("#q1");
    expect(questionHash("Q37")).toBe("#q37");
  });

  it("容忍首尾空白", () => {
    expect(questionHash(" Q7 ")).toBe("#q7");
  });
});

describe("parseQuestionHash", () => {
  it("解析合法锚点，大小写都认", () => {
    expect(parseQuestionHash("#q37")).toBe("Q37");
    expect(parseQuestionHash("#Q37")).toBe("Q37");
    expect(parseQuestionHash(" #q1 ")).toBe("Q1");
  });

  it("空锚点、分类锚点、乱写的一律返回 null", () => {
    expect(parseQuestionHash("")).toBeNull();
    expect(parseQuestionHash("#")).toBeNull();
    expect(parseQuestionHash("#installation")).toBeNull();
    expect(parseQuestionHash("#q")).toBeNull();
    expect(parseQuestionHash("#q37x")).toBeNull();
  });
});

describe("buildQuestionShareUrl", () => {
  it("拼出带锚点的完整链接", () => {
    expect(buildQuestionShareUrl("https://go.sunnyrose.xyz", "/troubleshooting", "Q37")).toBe(
      "https://go.sunnyrose.xyz/troubleshooting#q37",
    );
  });
});
