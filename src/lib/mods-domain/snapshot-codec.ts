import { gunzipSync } from "node:zlib";

/**
 * 兜底快照的**解码层**：字节 → 行数组。
 *
 * 单独成文件是为了可测：`snapshot.ts` 里混着 fs、fetch、unstable_cache 和模块级
 * 缓存，直接测它的解码口径要 mock 一大圈；这里只有 zlib + JSON，纯函数、无副作用。
 *
 * 这里用静态 `import "node:zlib"`（`snapshot.ts` 里是动态 import）是刻意的：
 * 本模块唯一的引用方是 server-only 的 snapshot.ts，不可能进客户端包，
 * 静态导入才能让 vitest 直接跑。**不要**从客户端组件引用本文件。
 *
 * 口径（与 scripts/mods-snapshot-export.mjs 的判据一致）：
 * - gunzip 或 JSON.parse 任一步失败 → 抛，绝不返回「部分数据」
 * - 根节点不是数组、**或空数组** → 抛。空数组是坏导出最危险的形态：
 *   前台会表现成「网关正常但一条数据都没有」，比抛错难查得多。
 *
 * 刻意不做逐行 schema 校验：导出是 `json_agg(row_to_json(...))` 出来的，
 * 结构由 SQL 保证；逐行校验只会多出一条「一行怪数据废掉整份快照」的新失败模式。
 */
export function decodeSnapshotGzip(gz: Uint8Array): Record<string, unknown>[] {
  let text: string;
  try {
    text = gunzipSync(gz).toString("utf8");
  } catch (error) {
    throw new Error(
      `兜底快照不是合法 gzip：${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `兜底快照不是合法 JSON：${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("兜底快照根节点不是非空数组");
  }

  return parsed as Record<string, unknown>[];
}

/**
 * COS 那份快照以 base64 字符串进 Data Cache（见 snapshot.ts 里为什么不能存字节数组），
 * 这里解回来。
 */
export function decodeSnapshotBase64(payload: string): Record<string, unknown>[] {
  // 非法字符 Buffer.from 会忽略、可能产出空 buffer，最终由 gunzip 的报错兜住 —— 会抛，不会静默返回 []
  return decodeSnapshotGzip(Buffer.from(payload, "base64"));
}
