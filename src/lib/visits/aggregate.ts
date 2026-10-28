import type { VisitRow } from "./types";

/**
 * 访问统计的**纯逻辑**：补零、取区间、算环比。
 *
 * 单独抽出来的理由和 `@/lib/engagement/store-core` 一样：页面与服务端都要用，
 * 而它们依赖 React / Next 的运行时；这里有单测，就不会为了「补零补错了」
 * 去起一个 dev server。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` 平移若干天。用 UTC 计算，避免本地时区把日期挪掉一天。 */
export function shiftDay(day: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;

  const [, year, month, date] = match;
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(date)) + delta * DAY_MS;

  return new Date(stamp).toISOString().slice(0, 10);
}

/**
 * 把「有数据的日期」铺成连续区间（升序，含 today），缺的日期补 0。
 *
 * 必须补零而不是只画有数据的点：服务端只会返回实际发生过的日期，
 * 中间断掉两天就在折线上连成一条假直线，会把「没人来」看成一个平台期。
 */
export function buildVisitRange(rows: VisitRow[], days: number, today: string): VisitRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const span = Math.max(1, Math.trunc(days));
  const result: VisitRow[] = [];

  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = shiftDay(today, -offset);
    const row = byDate.get(date);
    result.push({ date, uv: row?.uv ?? 0, pv: row?.pv ?? 0 });
  }

  return result;
}

export type VisitSummary = {
  today: VisitRow;
  yesterday: VisitRow;
  /** 与昨日相比的差值；昨日为 0 时是 null（涨幅无意义，页面上显示「—」） */
  uvDelta: number | null;
  pvDelta: number | null;
};

export function summarizeVisits(days: VisitRow[], today: string): VisitSummary {
  const yesterday = shiftDay(today, -1);
  const find = (date: string): VisitRow =>
    days.find((row) => row.date === date) ?? { date, uv: 0, pv: 0 };

  const todayRow = find(today);
  const yesterdayRow = find(yesterday);

  return {
    today: todayRow,
    yesterday: yesterdayRow,
    uvDelta: yesterdayRow.uv === 0 ? null : todayRow.uv - yesterdayRow.uv,
    pvDelta: yesterdayRow.pv === 0 ? null : todayRow.pv - yesterdayRow.pv,
  };
}

/**
 * 折线图纵轴上限：全 0 时给 1，避免除零；否则留 10% 余量。
 *
 * 用整数乘除而不是 `peak * 1.1`：浮点会让 100 × 1.1 变成 110.00000000000001，
 * ceil 之后纵轴凭空多一档（100 → 111）。
 */
export function chartMax(days: VisitRow[], pick: (row: VisitRow) => number): number {
  const peak = days.reduce((max, row) => Math.max(max, pick(row)), 0);
  return peak <= 0 ? 1 : Math.ceil((peak * 11) / 10);
}
