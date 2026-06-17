/**
 * 视觉风格切换 — 常量与类型定义
 *
 * 两种视觉皮肤：
 * - "zzz-immersive"  绝区零 Neo 风格（默认）— 现有 ZZZ 组件原生样式
 * - "zzz-dark"        绝区零深色沉浸式 — 个人中心同款深蓝黑 + 毛玻璃面板
 */
export type LayoutStyle = "zzz-immersive" | "zzz-dark";

export const LAYOUT_STYLES: readonly LayoutStyle[] = [
  "zzz-immersive",
  "zzz-dark",
] as const;

export const LAYOUT_STYLE_COOKIE = "wavemod-layout-style";
export const LAYOUT_STYLE_STORAGE_KEY = "wavemod-layout-style";
export const DEFAULT_LAYOUT_STYLE: LayoutStyle = "zzz-immersive";
export const LAYOUT_STYLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export { zLayoutStyle } from "./schema";
