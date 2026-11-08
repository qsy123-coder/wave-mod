/**
 * 把官方接口返回的原始行归一化成内部结构。
 *
 * 接口字段是中文（resourceType: "角色"/"武器"，cardPoolType: "角色精准调谐"），
 * 而且可能返回意料外的结构 —— 这里逐行校验，坏行直接丢弃并计数，
 * 不让脏数据把整个页面打崩。
 */

import { POOL_API_NAME_TO_ID, getPool } from "./pools";
import type { GachaRecord, QualityLevel, ResourceType } from "./types";

export type NormalizeResult = {
  records: GachaRecord[];
  /** 结构不合法被丢掉的行数 */
  skipped: number;
  /** 池名无法识别的行数（回退到请求时的池） */
  unknownPoolRows: number;
};

const QUALITY_LEVELS = new Set<QualityLevel>([3, 4, 5]);

export function normalizeApiRows(data: unknown, requestedPoolType: string): NormalizeResult {
  const fallbackPoolName = getPool(requestedPoolType)?.apiName ?? "";

  if (!Array.isArray(data)) {
    return { records: [], skipped: 0, unknownPoolRows: 0 };
  }

  const records: GachaRecord[] = [];
  let skipped = 0;
  let unknownPoolRows = 0;

  data.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      skipped += 1;
      return;
    }

    const raw = row as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name : "";
    const time = typeof raw.time === "string" ? raw.time : "";
    const resourceId = typeof raw.resourceId === "number" ? raw.resourceId : Number.NaN;
    const qualityLevel = raw.qualityLevel as QualityLevel;

    if (!name || !time || !Number.isInteger(resourceId) || !QUALITY_LEVELS.has(qualityLevel)) {
      skipped += 1;
      return;
    }

    const apiPoolName = typeof raw.cardPoolType === "string" ? raw.cardPoolType : "";
    const mappedPoolType = POOL_API_NAME_TO_ID.get(apiPoolName);
    if (!mappedPoolType) unknownPoolRows += 1;

    // 接口给中文类型；缺失时按 ID 段位兜底（角色 ID < 100000）
    const resourceType: ResourceType =
      raw.resourceType === "武器"
        ? "weapon"
        : raw.resourceType === "角色"
          ? "role"
          : resourceId < 100000
            ? "role"
            : "weapon";

    records.push({
      poolType: mappedPoolType ?? requestedPoolType,
      poolName: apiPoolName || fallbackPoolName,
      resourceId,
      qualityLevel,
      resourceType,
      name,
      time,
      order: index,
    });
  });

  return { records, skipped, unknownPoolRows };
}

/** 同一条记录可能在不同池的响应里重复出现，按池 + 物品 + 时间去重 */
export function dedupeRecords(records: readonly GachaRecord[]): GachaRecord[] {
  const seen = new Set<string>();
  const result: GachaRecord[] = [];

  for (const record of records) {
    const key = `${record.poolType}|${record.resourceId}|${record.time}|${record.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }

  return result;
}
