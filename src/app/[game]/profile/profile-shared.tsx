/** 统计项类型 */
export type StatItem = { label: string; value: string };

/**
 * 统一面板样式 — 深浅模式同款透明毛玻璃 + 粗黑边框 + 硬阴影
 * Neo: bg-white/70 + blur / Dark: CSS 覆盖 → 暗色毛玻璃
 */
export const panel =
  "border-4 border-black bg-white/30 shadow-[5px_5px_0px_0px_#000] backdrop-blur-[2px]";

/** 数字紧凑展示 */
export const compact = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
