/**
 * 执行互动计数的 Postgres 建表脚本（scripts/engagement-supabase.sql）。
 *
 * 背景：Vercel 函数到广州 COS 不通，计数改存 Supabase Postgres。
 * 表结构与原子 RPC 全部在 SQL 文件里，本脚本只负责「读文件 → 直连 psql → 包事务」。
 *
 * 用法（默认 dry-run，必须显式 --apply 才改库）：
 *   node scripts/run-engagement-sql.mjs --dry-run
 *   node scripts/run-engagement-sql.mjs --apply
 *
 * 为什么要包事务：建表、建函数、授权分散在多条语句里，中途失败会留下「有表没函数」
 * 的半套结构 —— 接口会报 RPC 不存在，比整笔回滚难查得多。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

import { psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const APPLY = process.argv.includes("--apply");
const sqlPath = resolve(process.cwd(), "scripts/engagement-supabase.sql");
const sql = readFileSync(sqlPath, "utf8");

requireDatabaseUrl();

if (!APPLY) {
  console.log(`📄 ${sqlPath}`);
  console.log("\n将执行这些结构变更：");
  for (const line of sql.split(/\r?\n/)) {
    if (/^(create|alter|revoke|grant|notify)\b/i.test(line.trim())) {
      console.log(`   ${line.trim().slice(0, 110)}`);
    }
  }
  console.log("\n🔍 DRY-RUN：未改动数据库。确认无误后加 --apply。");
  process.exit(0);
}

const result = await psqlJson(`begin;\n${sql}\ncommit;`);

console.log("✅ 已执行并提交：");
console.log(JSON.stringify(result, null, 2));

if (!result?.ok) {
  console.error("❌ 校验失败：表或函数没有建全");
  process.exit(1);
}
