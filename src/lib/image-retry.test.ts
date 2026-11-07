import { describe, expect, it } from "vitest";

import { appendImageRetryParam, appendImageRetryParamToSrcSet } from "./image-retry";

describe("appendImageRetryParam", () => {
  it("没有查询串时用 ? 拼接", () => {
    expect(appendImageRetryParam("https://a.test/x.webp", 3)).toBe("https://a.test/x.webp?_retry=3");
  });

  it("已有查询串时用 & 拼接，原参数保留", () => {
    expect(appendImageRetryParam("https://a.test/x.webp?imageMogr2/thumbnail/800x", 3)).toBe(
      "https://a.test/x.webp?imageMogr2/thumbnail/800x&_retry=3",
    );
  });

  it("重复调用是幂等的（不会叠加两个 _retry）", () => {
    const once = appendImageRetryParam("https://a.test/x.webp", 3);
    expect(appendImageRetryParam(once, 4)).toBe("https://a.test/x.webp?_retry=4");
  });

  it("空值原样返回", () => {
    expect(appendImageRetryParam("", 3)).toBe("");
  });
});

describe("appendImageRetryParamToSrcSet", () => {
  it("每条候选都带上 _retry，描述符不变", () => {
    const srcSet = "https://a.test/x.webp?w=320 320w, https://a.test/x.webp?w=800 800w";
    expect(appendImageRetryParamToSrcSet(srcSet, 7)).toBe(
      "https://a.test/x.webp?w=320&_retry=7 320w, https://a.test/x.webp?w=800&_retry=7 800w",
    );
  });

  it("不会把参数拼到描述符后面（否则整条 srcset 会被浏览器丢弃）", () => {
    const srcSet = "https://a.test/x.webp 320w";
    expect(appendImageRetryParamToSrcSet(srcSet, 1)).not.toContain("320w&");
    expect(appendImageRetryParamToSrcSet(srcSet, 1)).toBe("https://a.test/x.webp?_retry=1 320w");
  });
});
