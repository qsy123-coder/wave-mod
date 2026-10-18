import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { logger } from "@/lib/logger";

import { parseBaseline, type EngagementBaseline } from "./store-core";

/**
 * 互动计数的基线（Supabase 时代的历史计数）。
 *
 * 基线是**随代码一起部署的种子**（data/engagement-baseline.json，进 git），
 * 与「增量」分开存：重跑导入脚本只是覆盖这个文件，天然幂等，不会把历史数字叠加两次。
 *
 * 单独抽一个模块，是因为现在有两套落盘实现（本地文件 / COS 分片）都要读它，
 * 而 store.ts 会反过来 import cos-store，放一起会形成循环依赖。
 */

const BASELINE_PATH =
  process.env.ENGAGEMENT_BASELINE_PATH?.trim() || join(process.cwd(), "data", "engagement-baseline.json");

let baseline: EngagementBaseline | null = null;

export function getEngagementBaseline(): EngagementBaseline {
  if (baseline) return baseline;

  try {
    baseline = parseBaseline(existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : null);
  } catch (error) {
    logger.warn("[engagement] 基线文件读取失败，本次以空基线继续", {
      path: BASELINE_PATH,
      error: error instanceof Error ? error.message : String(error),
    });
    baseline = {};
  }

  return baseline;
}
