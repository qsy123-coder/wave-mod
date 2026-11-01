#!/usr/bin/env node
/**
 * 把 Supabase 的 public schema 搬到自建 PostgreSQL。
 *
 * 典型用法（在**香港机**上执行，避免 29MB dump 过公网两遍）：
 *
 *   SOURCE_DATABASE_URL='postgresql://...@aws-...pooler.supabase.com:5432/postgres' \
 *   TARGET_ADMIN_URL='postgresql://postgres:<密码>@127.0.0.1:5432/wavemod' \
 *   APP_DB_USER='wavemod_app' \
 *   node scripts/migrate-supabase-to-hk.mjs
 *
 * 可选参数：
 *   --dump-file=<path>   复用已有的 dump（跳过 pg_dump）
 *   --skip-dump          必须配合 --dump-file
 *   --force              目标库非空也继续（⚠️ 会删/覆盖同名对象）
 *   --skip-verify        跳过最后的校验（不推荐）
 *
 * 依赖：
 *   - pg_dump / pg_restore（**必须 ≥ 源库主版本 17**）
 *   - 目标账号需要建角色/建 schema/restore 的权限 ⇒ 用 postgres 超级用户
 *     （TARGET_ADMIN_URL），不要用只有 DML 权限的 wavemod_app。
 *
 * 步骤：
 *   1. 检查目标库是否为空
 *   2. pg_dump --schema=public -Fc
 *   3. 目标库预建 anon/authenticated/service_role + auth.users/auth.uid() 桩
 *      （否则 RLS policy、profiles→auth.users 外键会恢复失败）
 *   4. 过滤掉 dump 里的 `CREATE SCHEMA public`（新库默认已有）
 *   5. pg_restore
 *   6. 执行 db/cleanup-supabase-artifacts.sql
 *   7. 把 public 的权限授予应用角色
 *   8. 调 scripts/verify-migration.mjs 校验行数/校验和/列定义
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const args = new Set(process.argv.slice(2));
const argValue = (prefix) => {
  const found = process.argv.slice(2).find((arg) => arg.startsWith(`${prefix}=`));
  return found ? found.slice(prefix.length + 1) : null;
};

const SOURCE_URL = process.env.SOURCE_DATABASE_URL?.trim();
const TARGET_URL = process.env.TARGET_ADMIN_URL?.trim() || process.env.DATABASE_URL?.trim();
const APP_DB_USER = process.env.APP_DB_USER?.trim() || "wavemod_app";
const DB_NAME = process.env.DB_NAME?.trim() || "wavemod";

if (!SOURCE_URL) {
  console.error("❌ 缺少 SOURCE_DATABASE_URL（Supabase 直连串）");
  process.exit(1);
}
if (!TARGET_URL) {
  console.error("❌ 缺少 TARGET_ADMIN_URL 或 DATABASE_URL（自建库超级用户连接串）");
  process.exit(1);
}
if (SOURCE_URL === TARGET_URL) {
  console.error("❌ 源库与目标库是同一个连接串，拒绝执行。");
  process.exit(1);
}

if (!/^[a-z_][a-z0-9_]*$/.test(APP_DB_USER)) {
  console.error("❌ APP_DB_USER 只能是小写字母/数字/下划线");
  process.exit(1);
}

const pgDump = process.env.PG_DUMP_PATH?.trim() || "pg_dump";
const pgRestore = process.env.PG_RESTORE_PATH?.trim() || "pg_restore";

function sslFor(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
      return false;
    }
  } catch {
    // fall through
  }
  return { rejectUnauthorized: process.env.PG_VERIFY_FULL === "1" };
}

async function connect(connectionString, applicationName) {
  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 15_000,
    application_name: applicationName,
  });
  await client.connect();
  return client;
}

function run(command, argsList, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, argsList, {
    encoding: "utf8",
    env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  });

  if (result.error) {
    throw new Error(`无法执行 ${command}：${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr?.trim()}` : "";
    throw new Error(`${command} 退出码 ${result.status}${detail}`);
  }

  return result.stdout ?? "";
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "wavemod-migrate-"));
  const dumpFile = argValue("--dump-file") || join(tempDir, "public.pgc");
  const listFile = join(tempDir, "toc.list");

  try {
    console.error(`→ 目标库：${DB_NAME}（${new URL(TARGET_URL).hostname}）`);

    const targetAdmin = await connect(TARGET_URL, "wavemod-migrate-admin");

    try {
      const existing = await targetAdmin.query(
        "select count(*)::int as n from pg_tables where schemaname = 'public'",
      );

      if (existing.rows[0].n > 0 && !args.has("--force")) {
        throw new Error(
          `目标库 public 已有 ${existing.rows[0].n} 张表。确认要覆盖时加 --force（会与现有对象冲突）。`,
        );
      }

      // 1. dump
      if (argValue("--dump-file")) {
        if (!existsSync(dumpFile)) {
          throw new Error(`--dump-file 指向的文件不存在：${dumpFile}`);
        }
        console.error(`→ 复用 dump：${dumpFile}`);
      } else {
        if (args.has("--skip-dump")) {
          throw new Error("--skip-dump 必须配合 --dump-file 使用。");
        }
        console.error("→ pg_dump public schema…");
        run(pgDump, [
          `--dbname=${SOURCE_URL}`,
          "--schema=public",
          "--no-owner",
          "--no-privileges",
          "--format=custom",
          `--file=${dumpFile}`,
        ]);
        console.error(`  dump: ${dumpFile}`);
      }

      // 2. 预建 Supabase 桩对象
      console.error("→ 预建 auth 桩与托管平台角色…");
      await targetAdmin.query(`
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
        end
        $$;
        create schema if not exists auth;
        create table if not exists auth.users (id uuid primary key);
        create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      `);

      // profiles→auth.users 外键要求 auth.users 里先有这些 id
      const source = await connect(SOURCE_URL, "wavemod-migrate-source");
      try {
        const profiles = await source.query("select id from public.profiles");
        for (let i = 0; i < profiles.rows.length; i += 500) {
          const batch = profiles.rows.slice(i, i + 500).map((row) => row.id);
          await targetAdmin.query(
            "insert into auth.users (id) select unnest($1::uuid[]) on conflict do nothing",
            [batch],
          );
        }
        console.error(`  已预置 ${profiles.rows.length} 个 auth.users 桩 id`);
      } finally {
        await source.end();
      }

      // 3. 过滤掉 CREATE SCHEMA public（新库默认已有）
      console.error("→ 过滤 dump 的 TOC…");
      const toc = run(pgRestore, ["-l", dumpFile], { capture: true });
      const filtered = toc
        .split(/\r?\n/)
        .filter((line) => !/\sSCHEMA - public\s/.test(line))
        .join("\n");
      writeFileSync(listFile, `${filtered}\n`, "utf8");

      // 4. restore
      console.error("→ pg_restore…");
      run(pgRestore, [
        "--no-owner",
        "--no-privileges",
        `--dbname=${TARGET_URL}`,
        "--use-list",
        listFile,
        dumpFile,
      ]);

      // 5. 清理 Supabase 专属对象
      console.error("→ 清理 RLS / policy / auth 触发器…");
      const cleanupPath = join(process.cwd(), "db", "cleanup-supabase-artifacts.sql");
      await targetAdmin.query(readFileSync(cleanupPath, "utf8"));

      // 6. 授权给应用角色
      console.error(`→ 授权给应用角色 ${APP_DB_USER}…`);
      await targetAdmin.query(`
        grant usage on schema public to ${APP_DB_USER};
        grant all on all tables in schema public to ${APP_DB_USER};
        grant all on all sequences in schema public to ${APP_DB_USER};
        grant execute on all functions in schema public to ${APP_DB_USER};
        alter default privileges in schema public grant all on tables to ${APP_DB_USER};
        alter default privileges in schema public grant all on sequences to ${APP_DB_USER};
        alter default privileges in schema public grant all on functions to ${APP_DB_USER};
      `);

      console.error("✅ 数据搬迁完成。");
    } finally {
      await targetAdmin.end();
    }

    if (!args.has("--skip-verify")) {
      console.error("→ 校验迁移结果…");
      run(process.execPath, [join(process.cwd(), "scripts", "verify-migration.mjs")], {
        capture: false,
        // verify-migration.mjs 按惯例读 SOURCE_DATABASE_URL + DATABASE_URL
        env: { ...process.env, SOURCE_DATABASE_URL: SOURCE_URL, DATABASE_URL: TARGET_URL },
      });
    }
  } finally {
    if (!argValue("--dump-file")) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`\n❌ 迁移失败：${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
