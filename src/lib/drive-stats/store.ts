import "server-only";

import { shanghaiDayKey } from "@/lib/engagement/store-core";
import { isVisitsRemoteEnabled } from "@/lib/visits/remote-store";

import { localReadDrivePlatforms, localRecordDriveClick } from "./local-store";
import { normalizeDrivePlatform } from "./platform";
import { remoteReadDrivePlatforms, remoteRecordDriveClick } from "./remote-store";
import type { DrivePlatformRow } from "./types";

/**
 * 网盘点击统计的落点分派：配了 HK 服务就走远端，否则落本地文件。
 *
 * 与访问统计（`@/lib/visits/store`）同一套判断顺序，理由也一样：
 * 本地开发开箱即用，生产走自有服务，两边语义对齐。
 *
 * 平台名归一化放在这一层：无论落远端还是本地，写进去的 key 都是规范名。
 */

export async function recordDriveClick(
  platform: string,
  deviceId: string,
  today: string = shanghaiDayKey(),
): Promise<void> {
  const key = normalizeDrivePlatform(platform);
  if (!key) return;

  if (isVisitsRemoteEnabled()) return remoteRecordDriveClick(key, deviceId, today);
  return localRecordDriveClick(key, deviceId, today);
}

/** 读最近 N 天的平台数据；`null` = 读不到（页面要显示「暂不可用」，不能当成 0） */
export async function readDrivePlatforms(
  days: number,
  today: string = shanghaiDayKey(),
): Promise<DrivePlatformRow[] | null> {
  if (isVisitsRemoteEnabled()) return remoteReadDrivePlatforms(days, today);
  return localReadDrivePlatforms(days, today);
}
