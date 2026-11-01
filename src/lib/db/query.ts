import "server-only";

import type { PoolClient, QueryResultRow } from "pg";

import { getPool } from "@/lib/db/pool";

/**
 * 数据访问的最小封装：只提供参数化查询，不做查询构造器。
 *
 * 约定：
 *   - 所有 SQL 只用 `$1, $2, ...`，**禁止**把用户输入拼进字符串。
 *   - `queryRows` 返回行数组；`queryOne` 返回第一行或 null；`execute` 返回影响行数。
 *   - 多语句写入用 `withTransaction`，失败自动回滚。
 */

export async function queryRows<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(text, params);
  return rows[0] ?? null;
}

export async function execute(text: string, params: readonly unknown[] = []): Promise<number> {
  const result = await getPool().query(text, params as unknown[]);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // 回滚失败时保留原始错误；连接会被 Pool 丢弃（错误发生在事务里时 pg 会标记连接不可用）。
    }
    throw error;
  } finally {
    client.release();
  }
}
