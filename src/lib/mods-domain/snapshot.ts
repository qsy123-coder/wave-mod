import "server-only";

import { logger } from "@/lib/logger";

/**
 * Supabase 网关不可用时的本地兜底快照。
 *
 * 背景：2026-09-21 Supabase 项目因 `exceed_egress_quota` 被 restriction，
 * REST 与 Auth 全部返回 402 Payment Required：
 *
 *   "Service for this project is restricted due to the following violations:
 *    exceed_egress_quota."
 *
 * 封的是 HTTP 网关，直连 Postgres（5432 pooler）不受影响，因此可以用
 * scripts/export-mods-snapshot.ps1 从完好的库里导出已发布行，随仓库发布，
 * 供 public.ts 的读路径兜底 —— 保证网关被锁期间前台仍能浏览、搜索、翻页。
 *
 * 快照是**只读快照**，不承担写入：后台编辑、收藏、评论仍需 Supabase 恢复后才可用。
 * 由于写入此时本来就不通，快照不会产生「新内容看不到」的问题。
 *
 * 为什么存 .gz：未压缩 4.7MB，会被 outputFileTracingIncludes 复制进每个
 * serverless 函数；gzip 后仅 500KB。zlib 是 Node 内置，不引入新依赖。
 *
 * 为什么不含 xxmi_install_guide：该列全库只有 2 个近似取值（就是
 * install-guide.ts 里的静态文本，只差一个换行），却占 payload 约 24%
 * （实测每次整表扫省 1,384,698 字节 ≈ 1.32 MiB）。
 * 导出时不带该列，由 mapMod 统一回填默认常量 —— 与线上列表路径的口径一致，
 * 所以这里不需要再单独补该列。
 *
 * 代价：网关被锁期间，若某条 mod 的安装说明被后台自定义过，详情页会显示默认文本
 * （快照里没有该列的值）。全库当前没有这种行，且属于降级期可接受的损失。
 */

/** 快照根节点：原始行数组，字段名与 Supabase 返回的 snake_case 一致 */
let cachedRows: Record<string, unknown>[] | null = null;

async function loadAllRows(): Promise<Record<string, unknown>[]> {
  if (cachedRows) {
    return cachedRows;
  }

  try {
    // 动态 import，与 features/gallery/config.ts 一致，避免被客户端打包
    const [{ readFile }, { gunzipSync }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:zlib"),
      import("node:path"),
    ]);

    const filePath = path.join(process.cwd(), "data", "mods-snapshot.json.gz");
    const parsed: unknown = JSON.parse(gunzipSync(await readFile(filePath)).toString("utf8"));

    if (!Array.isArray(parsed)) {
      throw new Error("快照根节点不是数组");
    }

    cachedRows = parsed as Record<string, unknown>[];

    logger.info("[mods] 本地兜底快照已载入", { rows: cachedRows.length });
    return cachedRows;
  } catch (error) {
    // 缓存空数组而非抛错：兜底本身失败时不再让每个请求都重读磁盘刷日志
    logger.warn("[mods] 本地兜底快照载入失败", {
      error: error instanceof Error ? error.message : "unknown",
    });
    cachedRows = [];
    return cachedRows;
  }
}

/**
 * 取快照中某游戏的已发布行。形状与 getCachedModRowBatch 的返回值一致，
 * 因此调用方可以无差别地交给 mapMod / applyModQueryFilters 处理。
 */
export async function getSnapshotRows(gameKey: string): Promise<Record<string, unknown>[]> {
  const rows = await loadAllRows();
  return rows.filter((row) => row.game_key === gameKey);
}
