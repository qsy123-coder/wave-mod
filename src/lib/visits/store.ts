import "server-only";

import { shanghaiDayKey } from "@/lib/engagement/store-core";

import { localReadVisitDays, localRecordVisit } from "./local-store";
import { isVisitsRemoteEnabled, remoteReadVisitDays, remoteRecordVisit } from "./remote-store";
import type { VisitRow } from "./types";

/**
 * 访问统计的落点分派：配了 HK 服务就走远端，否则落本地文件。
 *
 * 与互动计数（`@/lib/engagement/store`）同一套判断顺序，理由也一样：
 * 本地开发开箱即用，生产走自有服务，两边语义对齐（见 local-store 顶部说明）。
 */

export async function recordVisit(deviceId: string, today: string = shanghaiDayKey()): Promise<void> {
  if (isVisitsRemoteEnabled()) return remoteRecordVisit(deviceId, today);
  return localRecordVisit(deviceId, today);
}

/** 读最近 N 天；`null` = 读不到（页面要显示「暂不可用」，不能当成 0） */
export async function readVisitDays(days: number, today: string = shanghaiDayKey()): Promise<VisitRow[] | null> {
  if (isVisitsRemoteEnabled()) return remoteReadVisitDays(days, today);
  return localReadVisitDays(days, today);
}
