import { gunzipSync, gzipSync } from "node:zlib";

/**
 * 整表领域对象的**压缩传输层**：对象数组 ⇄ base64(gzip(JSON))。
 *
 * 为什么需要它：Next.js 的 Data Cache 对**单条缓存项**有 2MB 上限，超限时不是报错而是
 * **静默跳过写入**（不报错、不告警、缓存等于没做）。整张表的领域对象约 5.5MB
 * （5609 条，2026-11-03），直接当归档存会踩这条线；gzip 后 base64 约 800KB，
 * 留出约 2.4x 的增长余量。
 *
 * 为什么不是「多分几片」：分片方案（旧实现）每片都是一次独立的 Data Cache 往返，
 * 11 片就是 11 次。实测纯计算只占 60–85ms，而线上 P75 是 510ms —— 多出来的
 * 400 多毫秒正是这些往返和逐片反序列化。合成一条 + 进程内 memo 之后，
 * 每个实例每个 payload 只付一次解码成本。
 *
 * 与 snapshot-codec.ts 的分工：那个解的是「兜底快照」的行数组（形状是原始行，
 * 空数组视为坏数据）；这个解的是「缓存里的领域对象」（形状是 SiteMod，空数组合法）。
 */

/**
 * base64 字符数上限（Data Cache 单条 2MB 的安全余量）。
 *
 * 超了不会抛 —— 内容仍然正确，只是这次写入会被 Next 静默丢掉，退化成
 * 「每个请求都重新查库 + 编码」。调用方负责打日志，测试负责在越线前就红。
 */
export const MODS_PAYLOAD_MAX_CHARS = 1_800_000;

export function encodeModsPayload(mods: unknown[]): string {
  return gzipSync(Buffer.from(JSON.stringify(mods), "utf8")).toString("base64");
}

export function decodeModsPayload<T>(payload: string): T[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
  } catch (error) {
    // 半截上传、换过新形状却复用了旧缓存 key 都会走到这里。必须抛：
    // 静默返回 [] 会变成「站点一条数据都没有」，比报错难查得多。
    throw new Error(`mods payload 解码失败：${error instanceof Error ? error.message : "unknown"}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("mods payload 根节点不是数组");
  }

  return parsed as T[];
}
