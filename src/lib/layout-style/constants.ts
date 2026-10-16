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

// 刻意**不**在这里 re-export `zLayoutStyle`（见 ./schema）：本模块被客户端组件
// （layout-style-provider / -toggle / -transition）引用，转出去就等于把整个 zod
// 打进每个页面的客户端包（2026-10-16 实测首页因此多下 63KB 压缩后的 zod）。
// 需要 schema 的服务端直接 import "@/lib/layout-style/schema"。
