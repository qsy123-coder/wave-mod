import "server-only";

import pg from "pg";

const { Pool } = pg;

/**
 * 自建 PostgreSQL 的连接池。
 *
 * 为什么不用 Supabase SDK：REST 网关在 2026-09 因出口配额被锁成 402，
 * 而直连 5432 一直是好的。迁移后应用只走 `pg`，不再依赖任何 HTTP 网关。
 *
 * 三个必须保留的细节：
 *   1. 用 `globalThis` 存池子：Vercel 的 Serverless 实例会复用进程，
 *      而 dev 模式的 HMR 会反复执行模块；不缓存会每次请求都新建池子。
 *   2. `max` 保持很小（默认 5）：真正的并发上限由 pgbouncer（transaction 模式）
 *      承担，应用侧只需要够用，避免一个实例打满数据库连接。
 *   3. `ssl` 必须显式传：显式值优先于连接串里的 `sslmode`（见
 *      `node_modules/pg/lib/connection-parameters.js`），否则 `sslmode=require`
 *      会被解释成「不校验证书」。
 */

const TIMESTAMPTZ_OID = 1184;
const NUMERIC_OID = 1700;

/**
 * 让 `pg` 的返回形状与原来的 Supabase/PostgREST 一致：
 *   - timestamptz → ISO 字符串（默认是 Date，`Date.parse` 与 JSON 序列化都会变）
 *   - numeric → number（默认是字符串，`ratingAverage` 会变成 "4.50"）
 *
 * 只改这两个 OID；uuid / text[] / jsonb 的默认解析本来就是我们要的形状。
 */
pg.types.setTypeParser(TIMESTAMPTZ_OID, (value: string) => new Date(value).toISOString());
pg.types.setTypeParser(NUMERIC_OID, (value: string) => Number(value));

type GlobalWithPool = typeof globalThis & {
  __wavemodPgPool?: pg.Pool;
};

function resolveSsl(connectionString: string): pg.PoolConfig["ssl"] {
  try {
    const { hostname } = new URL(connectionString);

    // 本地/CI 的临时集群没有证书，也不该为了开发去签一张。
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
      return false;
    }
  } catch {
    // URL 解析失败时按远程处理，让 TLS 报错暴露配置问题，而不是静默降级成明文。
  }

  return { rejectUnauthorized: true };
}

export function getPool(): pg.Pool {
  const globalRef = globalThis as GlobalWithPool;

  if (globalRef.__wavemodPgPool) {
    return globalRef.__wavemodPgPool;
  }

  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("缺少 DATABASE_URL，无法连接自建 PostgreSQL（见 docs/db-migration-selfhosted-pg-prd.md）。");
  }

  const pool = new Pool({
    application_name: "wavemod",
    connectionString,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 5_000),
    idleTimeoutMillis: 10_000,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: resolveSsl(connectionString),
  });

  // 空闲连接被数据库/网络掐断时，Pool 会发 error 事件；不监听会直接让进程崩掉。
  pool.on("error", (error) => {
    console.error("[db] idle client error", error.message);
  });

  globalRef.__wavemodPgPool = pool;

  return pool;
}
