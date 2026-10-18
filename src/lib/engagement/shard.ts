/**
 * 互动计数的分片函数（纯函数，无 IO）。
 *
 * 为什么分片：COS 对象存储没有「原子自增」，一次写必须是「读整片 → 改 → 写回」。
 * 把全站状态切成 N 片后，写冲突只可能发生在同一片内，概率降到原来的 1/N。
 * 读的时候也只取需要的那几片（按 mod.id 路由），而不是整份状态。
 *
 * ⚠️ 哈希必须与 `scripts/migrate-engagement-to-cos.mjs` 里那份**完全一致**，
 * 否则迁移时数据会落进与线上读取不同的分片，计数会「凭空消失」。
 * 改动这里要同步改脚本，并跑 `shard.test.ts`（里面钉死了几个 id 的期望分片）。
 */

/** 分片数量。16 片 × 约 35KB/片，单片读写都在几十毫秒量级 */
export const ENGAGEMENT_SHARD_COUNT = 16;

/**
 * mod.id → 分片下标。
 *
 * 用 FNV-1a 32 位：几十行就能复刻到脚本里，比 SHA-256 轻得多——
 * 这里只要求分布均匀、结果稳定，不要求抗碰撞。
 */
export function engagementShardIndex(modId: string, shardCount: number = ENGAGEMENT_SHARD_COUNT): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < modId.length; i += 1) {
    hash ^= modId.charCodeAt(i);
    // Math.imul 保证 32 位乘法不丢精度（直接 * 会溢出成浮点）
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % shardCount;
}

/** 分片的 COS 对象键 */
export function engagementShardKey(index: number): string {
  return `engagement/v2/shard-${index}.json`;
}
