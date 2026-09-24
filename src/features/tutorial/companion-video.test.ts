import { describe, expect, it } from "vitest";

import { toCompanionVideo } from "./companion-video";

/**
 * 这里守的是「配套视频无声消失/无声变形」：字段为空时前台应该**什么都不渲染**，
 * 而不是渲染一个 src 为空、点开才知道坏了的播放器。空串 poster 更是会退化成
 * 向当前页面地址取图（poster="" 的浏览器行为）。这些都只有测试能挡。
 */
describe("页面级配套视频的两列 → VideoConfig", () => {
  it("两列都有值时原样带出", () => {
    expect(
      toCompanionVideo({
        video_src: "https://cos.example/tutorial.mp4",
        video_poster: "https://cos.example/poster.webp",
      }),
    ).toEqual({
      src: "https://cos.example/tutorial.mp4",
      poster: "https://cos.example/poster.webp",
    });
  });

  it("只有 src 时合法，不能带出空 poster", () => {
    const video = toCompanionVideo({
      video_src: "https://cos.example/tutorial.mp4",
      video_poster: "",
    });

    expect(video).toEqual({ src: "https://cos.example/tutorial.mp4" });
    expect(video).not.toHaveProperty("poster");
  });

  it("src 为空串时视为没有视频", () => {
    expect(toCompanionVideo({ video_src: "", video_poster: "https://cos.example/p.webp" })).toBeUndefined();
  });

  it("src 只有空白字符时同样视为没有视频", () => {
    expect(toCompanionVideo({ video_src: "   " })).toBeUndefined();
  });

  it("两列都是 null（老版本教程）时没有视频", () => {
    expect(toCompanionVideo({ video_src: null, video_poster: null })).toBeUndefined();
  });

  it("迁移 SQL 未执行时两列是 undefined，不能当成有视频", () => {
    expect(toCompanionVideo({})).toBeUndefined();
    expect(toCompanionVideo(null)).toBeUndefined();
    expect(toCompanionVideo(undefined)).toBeUndefined();
  });
});
