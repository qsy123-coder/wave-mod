import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_BASE_ZERO_SINCE,
  isDownloadBaseFromZero,
  shanghaiDateKeyOf,
} from "@/lib/engagement/downloads-policy";

/**
 * 分界日必须按**上海日历日**判：每日上传脚本把 created_at 写成当天 12:00（上海）
 * = 04:00Z，看起来不会踩边界；但手工入库/后台新建的记录可能是任意时刻，
 * UTC 白天完全可能已经是上海的第二天。
 */
describe("isDownloadBaseFromZero", () => {
  it("分界日当天及以后 = 从 0 起算", () => {
    // 上海 2026-10-22 00:00 = 2026-10-21T16:00Z
    expect(isDownloadBaseFromZero("2026-10-21T16:00:00.000Z")).toBe(true);
    // 每日上传脚本的口径：上海正午
    expect(isDownloadBaseFromZero("2026-10-22T04:00:00.000Z")).toBe(true);
    expect(isDownloadBaseFromZero("2026-11-01T04:00:00.000Z")).toBe(true);
  });

  it("分界日之前保持旧口径（今天之前的不回改）", () => {
    // 上海 2026-10-21 23:59:59
    expect(isDownloadBaseFromZero("2026-10-21T15:59:59.999Z")).toBe(false);
    expect(isDownloadBaseFromZero("2026-10-21T04:00:00.000Z")).toBe(false);
    expect(isDownloadBaseFromZero("2025-01-01T00:00:00.000Z")).toBe(false);
  });

  it("日期解析不了时按老 mod 处理，不误伤真实下载", () => {
    expect(isDownloadBaseFromZero(null)).toBe(false);
    expect(isDownloadBaseFromZero(undefined)).toBe(false);
    expect(isDownloadBaseFromZero("")).toBe(false);
    expect(isDownloadBaseFromZero("not-a-date")).toBe(false);
  });

  it("接受 Date 对象", () => {
    expect(isDownloadBaseFromZero(new Date("2026-10-22T04:00:00.000Z"))).toBe(true);
  });

  it("分界日常量保持 2026-10-22（用户指定的「今天」，不要往后平移）", () => {
    expect(DOWNLOAD_BASE_ZERO_SINCE).toBe("2026-10-22");
  });
});

describe("shanghaiDateKeyOf", () => {
  it("按上海时区切日", () => {
    expect(shanghaiDateKeyOf("2026-10-21T16:00:00.000Z")).toBe("2026-10-22");
    expect(shanghaiDateKeyOf("2026-10-21T15:59:59.999Z")).toBe("2026-10-21");
  });
});
