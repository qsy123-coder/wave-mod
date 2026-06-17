/**
 * 视觉风格切换 — 常量与类型定义
 *
 * 两种风格：
 * - "zzz-immersive"  绝区零深色沉浸式风格（默认）
 * - "neo-brutalism"   全站新粗野主义经典风格
 */
export type LayoutStyle = "zzz-immersive" | "neo-brutalism";

export const LAYOUT_STYLES: readonly LayoutStyle[] = [
  "zzz-immersive",
  "neo-brutalism",
] as const;

/** Cookie 名称 — 服务端通过 cookies() 读取 */
export const LAYOUT_STYLE_COOKIE = "wavemod-layout-style";

/** localStorage key — 客户端备份 */
export const LAYOUT_STYLE_STORAGE_KEY = "wavemod-layout-style";

/** 默认风格：保持现有用户体验不变 */
export const DEFAULT_LAYOUT_STYLE: LayoutStyle = "zzz-immersive";

/** Cookie 有效期：1 年 */
export const LAYOUT_STYLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Zod schema — 运行时校验 */
export { zLayoutStyle } from "./schema";
