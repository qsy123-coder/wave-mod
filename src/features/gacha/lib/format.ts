/** 展示层的小工具：统一空值、百分比与 UID 打码的口径。 */

export function formatPity(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatRate(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/** 106485288 → 106•••288；太短的 UID 全部打码 */
export function maskUid(uid: string): string {
  if (uid.length <= 6) return "•".repeat(uid.length);
  const hidden = Math.max(3, uid.length - 6);
  return `${uid.slice(0, 3)}${"•".repeat(hidden)}${uid.slice(-3)}`;
}

/** "2026-01-01 12:00:00" → "2026-01-01" */
export function formatDay(time: string | null): string {
  return time ? time.slice(0, 10) : "—";
}

export function formatRange(earliest: string | null, latest: string | null): string {
  if (!earliest || !latest) return "—";
  return `${formatDay(earliest)} ~ ${formatDay(latest)}`;
}
