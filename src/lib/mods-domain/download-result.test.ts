import { describe, expect, it } from "vitest";

import { DIRECT_DOWNLOAD_UNAVAILABLE, resolveDownloadResponse } from "./download-result";

describe("resolveDownloadResponse", () => {
  it("200 + ok + downloadUrl 时返回可打开的真实 URL", () => {
    const result = resolveDownloadResponse(200, { ok: true, downloadUrl: "https://example.com/a.zip" });
    expect(result).toEqual({ ok: true, url: "https://example.com/a.zip" });
  });

  it("URL 前后有空白时先 trim", () => {
    const result = resolveDownloadResponse(200, { ok: true, downloadUrl: "  https://example.com/a.zip  " });
    expect(result).toEqual({ ok: true, url: "https://example.com/a.zip" });
  });

  // 这一条是本次修复的核心：400/500 必须给出可读文案，不能静默。
  it("500（Supabase 网关被锁）时给出网盘链接引导，而不是静默返回", () => {
    const result = resolveDownloadResponse(500, { ok: false, error: "Service for this project is restricted due to the following violations: exceed_egress_quota." });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe(DIRECT_DOWNLOAD_UNAVAILABLE);
  });

  it("不把服务端原始报文透给用户", () => {
    const result = resolveDownloadResponse(500, { ok: false, error: "exceed_egress_quota" });
    expect(result.ok === false && result.message).not.toContain("exceed_egress_quota");
    expect(result.ok === false && result.message).not.toContain("restricted");
  });

  it("404 单独给出「已下架」的说法，跟服务故障区分开", () => {
    const result = resolveDownloadResponse(404, { ok: false, error: "not_found" });
    expect(result.ok === false && result.message).toContain("不存在或已下架");
  });

  it("400（该 mod 没有 download_url）也回退到网盘链接引导", () => {
    const result = resolveDownloadResponse(400, { ok: false, error: "missing_download_url" });
    expect(result.ok === false && result.message).toBe(DIRECT_DOWNLOAD_UNAVAILABLE);
  });

  it("200 但缺 downloadUrl 时不当作成功", () => {
    expect(resolveDownloadResponse(200, { ok: true }).ok).toBe(false);
  });

  it("200 但 ok 不为 true 时不当作成功", () => {
    expect(resolveDownloadResponse(200, { downloadUrl: "https://example.com/a.zip" }).ok).toBe(false);
  });

  it("响应体不是对象时不崩，走兜底文案", () => {
    for (const payload of [null, undefined, "boom", 42, []]) {
      const result = resolveDownloadResponse(200, payload);
      expect(result.ok).toBe(false);
    }
  });

  // download_url 是外部输入（后台/脚本写入），放行伪协议会在 window.open 里变成 XSS 面
  it("挡掉 javascript: 等非 http(s) 协议", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://example.com/a.zip", "file:///c:/a.zip"]) {
      const result = resolveDownloadResponse(200, { ok: true, downloadUrl: url });
      expect(result.ok).toBe(false);
    }
  });

  it("downloadUrl 不是字符串时不当作成功", () => {
    expect(resolveDownloadResponse(200, { ok: true, downloadUrl: { href: "https://example.com" } }).ok).toBe(false);
  });
});
