import type { VideoConfig } from "./types";

/** tutorial_configs 上页面级配套视频的两列（结构类型，避免依赖 admin 层的 row 类型） */
export interface CompanionVideoColumns {
  video_src?: string | null;
  video_poster?: string | null;
}

/**
 * 把 tutorial_configs 的页面级配套视频两列映射成前台用的 VideoConfig。
 *
 * 三条边界都要处理，任何一条错了页面都会出声（一个空 src 的 <video>、或者一张裂图）：
 * - 迁移 SQL 未执行时 `select("*")` 取不到这两列，`config.video_src` 是 **undefined 而不是 null**
 *   （所以这里一律按真值判断，不能写 `!== null`）；
 * - 后台把输入框清空保存进来的是**空串**，同样要当作「没有视频」；
 * - 有 src 无 poster 是合法的（卡片退回无封面的样式），但空串 poster 不能带出去，
 *   否则 `poster=""` 会让浏览器按「当前页面 URL」去取图。
 */
export function toCompanionVideo(
  config: CompanionVideoColumns | null | undefined,
): VideoConfig | undefined {
  const src = config?.video_src?.trim();
  if (!src) return undefined;

  const poster = config?.video_poster?.trim();
  return poster ? { src, poster } : { src };
}
