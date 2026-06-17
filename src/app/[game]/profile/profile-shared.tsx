/** 统计项类型 */
export type StatItem = { label: string; value: string };

/** 统一面板样式 */
export const panel =
  "border-4 border-black bg-[#07111f]/42 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 backdrop-blur-[2px]";

/** 数字紧凑展示 */
export const compact = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
