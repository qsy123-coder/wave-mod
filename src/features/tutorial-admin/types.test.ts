import { describe, expect, it } from "vitest";

import { saveDraftInputSchema } from "./types";

/** 一份最小的合法草稿输入，用来单独试 config 上的字段 */
function draftWith(config: Record<string, unknown>) {
  return {
    config: {
      title: "新版教程",
      subtitle: "先看我",
      image_base_path: "/tutorial/",
      ...config,
    },
    chapters: [{ sort_order: 0, chapter_key: "00", title: "解压", type: "images" }],
  };
}

/**
 * 这里守的是「配套视频被静默清空」。
 *
 * Zod 默认**剥掉** schema 上没声明的键，不报错。saveDraft 的 config 走的就是这个 schema，
 * 所以漏加字段的症状是：后台填好配套视频 → 保存 → 库里的值变成 NULL，
 * 全程没有任何报错，只是前台卡片无声消失。publishTutorial 又是从 draft 复制字段的，
 * 一次保存就能把它彻底抹掉 —— 这层测试是这个改动里最便宜的护栏。
 */
describe("saveDraftInputSchema 放行页面级配套视频字段", () => {
  it("video_src / video_poster 不会被 Zod 剥掉", () => {
    const parsed = saveDraftInputSchema.parse(
      draftWith({
        video_src: "https://cos.example/tutorial/companion/1/tutorial.mp4",
        video_poster: "https://cos.example/tutorial/companion/1/poster.webp",
      }),
    );

    expect(parsed.config.video_src).toBe("https://cos.example/tutorial/companion/1/tutorial.mp4");
    expect(parsed.config.video_poster).toBe("https://cos.example/tutorial/companion/1/poster.webp");
  });

  it("不带这两项也能通过（既有调用点不受影响）", () => {
    const parsed = saveDraftInputSchema.parse(draftWith({}));

    expect(parsed.config.video_src).toBeUndefined();
    expect(parsed.config.video_poster).toBeUndefined();
  });

  it("留空字符串也放行 —— 服务端据此归一成 NULL（= 该版本没有配套视频）", () => {
    const parsed = saveDraftInputSchema.parse(draftWith({ video_src: "", video_poster: "" }));

    expect(parsed.config.video_src).toBe("");
    expect(parsed.config.video_poster).toBe("");
  });
});
