import type {
  DriveClickDay,
  DrivePlatformRow,
  DrivePlatformStats,
  DriveStats,
} from "./types";

/**
 * 网盘点击统计的**纯逻辑**：补零、取今日/昨日、排序、算占比。
 *
 * 与 `@/lib/visits/aggregate` 同一套理由：页面要用，但起 dev server 才能验证
 * 「补零补错了」代价太高，所以这里可单测。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` 平移若干天。用 UTC 计算，避免本地时区把日期挪掉一天。 */
export function shiftDriveDay(day: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;

  const [, year, month, date] = match;
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(date)) + delta * DAY_MS;

  return new Date(stamp).toISOString().slice(0, 10);
}

function toCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

/** 补零后的连续日期（升序，含 today） */
function buildDates(span: number, today: string): string[] {
  const dates: string[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    dates.push(shiftDriveDay(today, -offset));
  }
  return dates;
}

/**
 * 把服务端返回的「有数据的日期」铺成连续区间，并按累计点击降序排列。
 *
 * 必须补零而不是只保留有数据的点：sparkline 会把缺口连成一条假直线，
 * 看起来像「那几天一直有人点」。
 */
export function buildDriveStats(
  rows: DrivePlatformRow[],
  days: number,
  today: string,
): DriveStats {
  const span = Math.max(1, Math.trunc(days));
  const yesterday = shiftDriveDay(today, -1);
  const dates = buildDates(span, today);

  const platforms: DrivePlatformStats[] = rows
    .filter((row) => Boolean(row.platform))
    .map((row) => {
      const byDate = new Map<string, number>();
      let seriesSum = 0;

      for (const day of row.days) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue;
        const count = toCount(day.count);
        byDate.set(day.date, count);
        seriesSum += count;
      }

      const series: DriveClickDay[] = dates.map((date) => ({
        date,
        count: byDate.get(date) ?? 0,
      }));

      return {
        platform: row.platform,
        // total 是权威累计值；万一它丢了但每日数据还在，用每日之和兜回来
        total: Math.max(toCount(row.total), seriesSum),
        today: byDate.get(today) ?? 0,
        yesterday: byDate.get(yesterday) ?? 0,
        days: series,
        share: 0,
      };
    })
    .filter((row) => row.total > 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.today - a.today ||
        a.platform.localeCompare(b.platform, "zh-CN"),
    );

  const total = platforms.reduce((sum, row) => sum + row.total, 0);
  const todayCount = platforms.reduce((sum, row) => sum + row.today, 0);
  const yesterdayCount = platforms.reduce((sum, row) => sum + row.yesterday, 0);

  for (const row of platforms) {
    // 总数为 0 时直接给 0，避免 0/0 = NaN 传到界面上
    row.share = total > 0 ? row.total / total : 0;
  }

  return { platforms, total, today: todayCount, yesterday: yesterdayCount };
}
