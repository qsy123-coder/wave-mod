/**
 * 鸣潮卡池定义。
 *
 * 口径移植自 juliy819/wuwa-gacha-tool（Apache-2.0）：
 * `src-tauri/src/gacha/fetcher.rs` 的 POOL_TYPES 与硬保底规则。
 * 见同目录 NOTICE.md。
 */

export type PoolGroup =
  | "up-role"
  | "up-weapon"
  | "standard-role"
  | "standard-weapon"
  | "novice"
  | "memory-role"
  | "memory-weapon";

export type PoolDefinition = {
  /** 传给官方接口的 cardPoolType */
  id: string;
  /** 官方接口返回的中文池名 */
  apiName: string;
  /** 页面上展示的名字 */
  displayName: string;
  group: PoolGroup;
};

export const POOLS: readonly PoolDefinition[] = [
  { id: "1", apiName: "角色精准调谐", displayName: "角色活动唤取", group: "up-role" },
  { id: "2", apiName: "武器精准调谐", displayName: "武器活动唤取", group: "up-weapon" },
  { id: "3", apiName: "角色常驻调谐", displayName: "角色常驻唤取", group: "standard-role" },
  { id: "4", apiName: "武器常驻调谐", displayName: "武器常驻唤取", group: "standard-weapon" },
  { id: "5", apiName: "新手调谐", displayName: "新手唤取", group: "novice" },
  { id: "6", apiName: "新手自选调谐", displayName: "新手自选唤取", group: "novice" },
  {
    id: "7",
    apiName: "新手自选调谐（感恩定向调谐）",
    displayName: "新手自选唤取",
    group: "novice",
  },
  { id: "8", apiName: "角色新旅调谐", displayName: "角色新旅唤取", group: "up-role" },
  { id: "9", apiName: "武器新旅调谐", displayName: "武器新旅唤取", group: "up-weapon" },
  { id: "10", apiName: "角色联动调谐", displayName: "角色联动唤取", group: "up-role" },
  { id: "11", apiName: "武器联动调谐", displayName: "武器联动唤取", group: "up-weapon" },
  { id: "12", apiName: "角色忆旅调谐", displayName: "角色忆旅唤取", group: "memory-role" },
  { id: "13", apiName: "武器忆旅调谐", displayName: "武器忆旅唤取", group: "memory-weapon" },
] as const;

/** 官方接口只接受 1–13 的数字 ID */
export const POOL_TYPE_IDS = POOLS.map((pool) => pool.id);

export const POOL_GROUP_LABELS: Record<PoolGroup, string> = {
  "up-role": "UP 角色池",
  "up-weapon": "UP 武器池",
  "standard-role": "常驻角色池",
  "standard-weapon": "常驻武器池",
  novice: "新手池",
  "memory-role": "忆旅角色池",
  "memory-weapon": "忆旅武器池",
};

/** 限定角色池：只有这些池存在 50/50 与「歪」的概念 */
export const LIMITED_CHAR_POOL_IDS = new Set(["1", "8", "10", "12"]);

/** 官方公示的常驻五星角色：维里奈、卡卡罗、鉴心、凌阳、安可 */
export const STANDARD_FIVE_STAR_ROLE_IDS = new Set([1104, 1203, 1301, 1405, 1503]);

/** 常驻五星武器 */
export const STANDARD_FIVE_STAR_WEAPON_IDS = new Set([
  21010015, 21020015, 21030015, 21040015, 21050015, 21010045, 21020045, 21030045, 21040045,
  21050045,
]);

export function getPool(poolType: string): PoolDefinition | undefined {
  return POOLS.find((pool) => pool.id === poolType);
}

export function getPoolDisplayName(poolType: string): string {
  return getPool(poolType)?.displayName ?? "未知卡池";
}

export function getPoolGroupLabel(poolType: string): string {
  const pool = getPool(poolType);
  return pool ? POOL_GROUP_LABELS[pool.group] : "其他";
}

export function isLimitedCharPool(poolType: string): boolean {
  return LIMITED_CHAR_POOL_IDS.has(poolType);
}

/** 新手池 50 抽硬保底，其余 80 抽 */
export function hardPityForPool(poolType: string): number {
  return poolType === "5" ? 50 : 80;
}

/** 新手池没有分段软保底，规则曲线不适用 */
export function hasSoftPity(poolType: string): boolean {
  return poolType !== "5";
}

/** 中文池名 → 数字 ID，用于把接口返回的行归回正确的池 */
export const POOL_API_NAME_TO_ID: ReadonlyMap<string, string> = new Map(
  POOLS.map((pool) => [pool.apiName, pool.id]),
);
