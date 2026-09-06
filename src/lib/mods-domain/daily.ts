import "server-only";

import { defaultGameKey } from "@/config/games";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { ModRow, SiteMod } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

// 每天一条的"每日更新"分组。
// 规则（与 PRD 一致性）：
//   - 只按 createdAt（首次创建时间）归组，绝不使用 updatedAt。
//   - 下架（is_published=false）不展示；下架后再上线/编辑只会改 updatedAt，
//     createdAt 不变 → 归入最初创建那天，不冒充"今天的新更新"。

/** 每天一组的展示数据 */
export type DailyUpdateDay = {
  /** 日期键，格式 YYYY-MM-DD（Asia/Shanghai） */
  date: string;
  /** 是否今天 */
  isToday: boolean;
  /** 顶部胶囊用的短标题：今天 / 昨天 / M月D日 */
  shortLabel: string;
  /** 分组头用的完整标题：YYYY年M月D日（今天/昨天） */
  fullLabel: string;
  /** 当天更新的全部 mod（已按 created_at 倒序） */
  mods: SiteMod[];
  /** 当天 mod 数量 = mods.length */
  count: number;
};

export type DailyUpdatesResult = {
  /** 今天对应的日期键 YYYY-MM-DD（Asia/Shanghai） */
  today: string;
  /** 最近 days 天，从今天倒序，含无更新的空天（供日期胶囊渲染） */
  days: DailyUpdateDay[];
};

const DAILY_TZ = "Asia/Shanghai";
const DAY_MS = 24 * 60 * 60 * 1000;

// 用上海日历把 ISO 时间戳格式化成 YYYY-MM-DD
function toDateKey(iso: string, tz = DAILY_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// 生成最近 days 天的日期键（含今天），倒序：今天在最前。
// 中国无夏令时，按固定 24h 递减即可保持"当前时刻的前一天"在同一上海钟点上。
function recentDateKeys(days: number, tz = DAILY_TZ): string[] {
  const keys: string[] = [];
  const now = Date.now();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (let i = 0; i < days; i++) {
    keys.push(fmt.format(new Date(now - i * DAY_MS)));
  }
  return keys;
}

function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/**
 * 拉取最近 days 天内按天分组的公开 mod。
 * - days 默认 14，最小 1，最大 30（与每日更新页一致）。
 * - 只查范围内数据（按 createdAt 宽松上界过滤），按 createdAt 倒序返回。
 */
export async function getDailyUpdates(
  days = 14,
  gameKey = defaultGameKey,
): Promise<DailyUpdatesResult> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  // 宽松上界：多捞一天，避免时区把临界 mod 划出去；多出的部分在分组时被 dateKeys 过滤掉
  const since = new Date(Date.now() - (safeDays + 1) * DAY_MS);

  let supabase;
  try {
    supabase = createPublicReadClient();
  } catch (error) {
    logger.warn("[daily] getDailyUpdates skipped because Supabase env is missing", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { today: recentDateKeys(safeDays)[0], days: [] };
  }

  const { data, error } = await supabase
    .from("mods")
    .select(publicModColumns)
    .eq("is_published", true)
    .eq("game_key", gameKey)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn("[daily] getDailyUpdates failed, fallback to empty list", { error: error.message });
    return { today: recentDateKeys(safeDays)[0], days: [] };
  }

  const mods = (data ?? []).map((row) => mapMod(row as ModRow));

  // 归入最近 safeDays 天的日期集合
  const dateKeys = recentDateKeys(safeDays);
  const keySet = new Set(dateKeys);
  const byDate = new Map<string, SiteMod[]>();
  for (const mod of mods) {
    const key = toDateKey(mod.createdAt);
    if (!keySet.has(key)) continue;
    const arr = byDate.get(key);
    if (arr) arr.push(mod);
    else byDate.set(key, [mod]);
  }

  // 组装最近 safeDays 天（含空天），倒序
  const today = dateKeys[0];
  const daysList: DailyUpdateDay[] = [];
  for (let i = 0; i < dateKeys.length; i++) {
    const key = dateKeys[i];
    const { y, m, d } = parseKey(key);
    const isToday = i === 0;
    const isYesterday = i === 1;
    const suffix = isToday ? "（今天）" : isYesterday ? "（昨天）" : "";
    daysList.push({
      date: key,
      isToday,
      shortLabel: isToday ? "今天" : isYesterday ? "昨天" : `${m}月${d}日`,
      fullLabel: `${y}年${m}月${d}日${suffix}`,
      mods: byDate.get(key) ?? [],
      count: byDate.get(key)?.length ?? 0,
    });
  }

  return { today, days: daysList };
}
