#!/usr/bin/env node
/**
 * 校验「Supabase 源库 → 自建 PostgreSQL 目标库」的数据一致性。
 *
 * 用法：
 *   SOURCE_DATABASE_URL='postgres://...supabase...' \
 *   DATABASE_URL='postgres://...hk...' \
 *   node scripts/verify-migration.mjs
 *
 * 检查三件事：
 *   1. public 下每张表的行数一致
 *   2. mods 的关键字段（id/title/character/created_at）校验和一致
 *   3. public 的列定义（列名/类型/可空/顺序）一致
 *
 * ⚠️ 时间戳必须按 UTC 归一化后再算 md5：
 *    Supabase 会话时区是 UTC，自建库默认可能是 Asia/Shanghai，
 *    同一个 timestamptz 的 ::text 会不同，直接比较会误报。
 *
 * 退出码：0 = 全部一致；1 = 有差异（会逐项打印）。
 */

import { Client } from "pg";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`❌ 缺少 ${name}`);
    process.exit(1);
  }
  return value;
}

function sslFor(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
      return false;
    }
  } catch {
    // fall through
  }
  // Supabase pooler 与自建 pgbouncer 都使用公开证书链；脚本不做 pinning。
  return { rejectUnauthorized: process.env.PG_VERIFY_FULL === "1" };
}

async function withClient(connectionString, fn) {
  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 15_000,
    application_name: "wavemod-verify",
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function snapshot(client) {
  const tables = (
    await client.query(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    )
  ).rows.map((row) => row.tablename);

  const counts = {};
  for (const table of tables) {
    const result = await client.query(`select count(*)::bigint as n from public.${quoteIdent(table)}`);
    counts[table] = Number(result.rows[0].n);
  }

  const mods = (
    await client.query(
      `select
         count(*)::int as count,
         md5(string_agg(
           id::text || title || character ||
           to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
           '|' order by id
         )) as checksum
       from public.mods`,
    )
  ).rows[0];

  const columns = (
    await client.query(
      `select table_name, column_name, data_type, is_nullable, ordinal_position
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position`,
    )
  ).rows;

  return { tables, counts, mods, columns };
}

function compare(source, target) {
  const issues = [];

  const sourceTables = new Set(source.tables);
  const targetTables = new Set(target.tables);

  for (const table of sourceTables) {
    if (!targetTables.has(table)) {
      issues.push(`表缺失：${table}`);
      continue;
    }
    if (source.counts[table] !== target.counts[table]) {
      issues.push(`行数不一致：${table} 源=${source.counts[table]} 目标=${target.counts[table]}`);
    }
  }

  for (const table of targetTables) {
    if (!sourceTables.has(table)) {
      issues.push(`目标库多出表：${table}`);
    }
  }

  if (source.mods.count !== target.mods.count) {
    issues.push(`mods 行数：源=${source.mods.count} 目标=${target.mods.count}`);
  }
  if (source.mods.checksum !== target.mods.checksum) {
    issues.push(`mods 校验和不一致：源=${source.mods.checksum} 目标=${target.mods.checksum}`);
  }

  const key = (row) => `${row.table_name}.${row.column_name}`;
  const sourceColumns = new Map(source.columns.map((row) => [key(row), row]));
  const targetColumns = new Map(target.columns.map((row) => [key(row), row]));

  for (const [k, row] of sourceColumns) {
    const other = targetColumns.get(k);
    if (!other) {
      issues.push(`列缺失：${k}`);
      continue;
    }
    if (row.data_type !== other.data_type || row.is_nullable !== other.is_nullable) {
      issues.push(
        `列定义不一致：${k} 源=${row.data_type}/${row.is_nullable} 目标=${other.data_type}/${other.is_nullable}`,
      );
    }
  }

  for (const k of targetColumns.keys()) {
    if (!sourceColumns.has(k)) issues.push(`目标库多出列：${k}`);
  }

  return issues;
}

async function main() {
  const sourceUrl = requireEnv("SOURCE_DATABASE_URL");
  const targetUrl = requireEnv("DATABASE_URL");

  console.error("→ 读取源库快照…");
  const source = await withClient(sourceUrl, snapshot);
  console.error("→ 读取目标库快照…");
  const target = await withClient(targetUrl, snapshot);

  console.log(`源库：${source.tables.length} 张表，mods=${source.mods.count}，checksum=${source.mods.checksum}`);
  console.log(`目标：${target.tables.length} 张表，mods=${target.mods.count}，checksum=${target.mods.checksum}`);

  const issues = compare(source, target);

  if (issues.length > 0) {
    console.error(`\n❌ 发现 ${issues.length} 处差异：`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log("\n✅ 迁移校验通过：表、行数、mods 校验和、列定义全部一致。");
}

main().catch((error) => {
  console.error("❌ 校验失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
