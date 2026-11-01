import { describe, expect, it } from "vitest";

import { injectToken } from "./html.mjs";

const HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/style.css" />
</head><body><script type="module" src="/app.js"></script></body></html>`;

describe("injectToken", () => {
  it("给 style.css 和 app.js 都带上 token", () => {
    const out = injectToken(HTML, "abc-123");
    expect(out).toContain('href="/style.css?t=abc-123"');
    expect(out).toContain('src="/app.js?t=abc-123"');
    expect(out).not.toContain('href="/style.css"');
  });

  it("没有 token 时原样返回（不拼出 ?t=undefined）", () => {
    expect(injectToken(HTML, "")).toBe(HTML);
  });

  it("不碰其它 URL", () => {
    const out = injectToken('<a href="/api/dirs">x</a><link href="/style.css">', "t1");
    expect(out).toContain('<a href="/api/dirs">x</a>');
  });
});
