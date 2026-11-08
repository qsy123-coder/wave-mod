/** 唤取工具的数据模型。所有字段都是官方接口原始值的归一化结果。 */

export type QualityLevel = 3 | 4 | 5;
export type ResourceType = "role" | "weapon";
export type ServerRegion = "cn" | "global";

export type GachaRecord = {
  /** "1".."13" */
  poolType: string;
  /** 接口返回的中文池名，例如「角色精准调谐」 */
  poolName: string;
  resourceId: number;
  qualityLevel: QualityLevel;
  resourceType: ResourceType;
  name: string;
  /** 接口原样时间字符串：YYYY-MM-DD HH:mm:ss */
  time: string;
  /**
   * 该记录在接口响应里的下标（0 = 最新）。
   * 接口按新→旧返回，十连共享同一时间戳时用它还原真实抽取顺序。
   */
  order: number;
};

export type FiveStarInterval = {
  record: GachaRecord;
  /** 距上一个五星的抽数（含本次） */
  pulls: number;
  /** 历史被官方截断时，真实抽数只会更大，展示为 ≥ */
  isLowerBound: boolean;
  isOffRate: boolean;
};

export type DistributionBin = {
  start: number;
  end: number;
  label: string;
  count: number;
};

export type FeaturedCycle = {
  record: GachaRecord;
  /** 从上一个 UP 结束到本次 UP 出金的全部抽数（含前置歪） */
  pulls: number;
  /** 周期内的歪 */
  offRateRecords: GachaRecord[];
  isLowerBound: boolean;
};

export type PoolInsight = {
  poolType: string;
  poolName: string;
  groupLabel: string;
  totalPulls: number;
  fiveStarCount: number;
  hardPity: number;
  currentPity: number;
  currentPityLowerBound: boolean;
  intervals: FiveStarInterval[];
  averagePity: number | null;
  medianPity: number | null;
  bestPity: number | null;
  worstPity: number | null;
  distribution: DistributionBin[];
  /** 50/50：只统计限定角色池里真正参与 50/50 的五星 */
  featuredAttempts: number;
  featuredWins: number;
  featuredOffRate: number;
  featuredWinRate: number | null;
  featuredCycles: FeaturedCycle[];
  featuredAveragePulls: number | null;
  featuredMedianPulls: number | null;
  featuredBestPulls: number | null;
  featuredWorstPulls: number | null;
  /** 累计出金率（按用户自身完整区间） */
  cumulative: { pull: number; percentage: number }[];
};

export type Overview = {
  totalPulls: number;
  fiveStarCount: number;
  fourStarCount: number;
  fiveStarRate: number;
  averagePity: number | null;
  medianPity: number | null;
  bestPity: number | null;
  worstPity: number | null;
  featuredAttempts: number;
  featuredWins: number;
  featuredWinRate: number | null;
  earliestTime: string | null;
  latestTime: string | null;
  pools: PoolInsight[];
};

export type Acquisition = {
  record: GachaRecord;
  /** 本次出金用了多少抽（距上一个五星） */
  pulls: number;
  isLowerBound: boolean;
  /** 本次获取之前、同一个目标周期内歪了几次 */
  offRateBefore: number;
  /** 从上一个同名目标（或历史起点）到本次的全部抽数，含前置歪 */
  costPulls: number;
  cumulativePulls: number;
};

export type CostProfile = {
  resourceId: number;
  name: string;
  resourceType: ResourceType;
  poolType: string;
  poolName: string;
  acquisitions: Acquisition[];
  totalPulls: number;
  averagePulls: number | null;
  bestPulls: number | null;
  worstPulls: number | null;
  isLowerBound: boolean;
};
