/**
 * 绕过 Supabase HTTP 网关、直连 Postgres(5432 pooler) 的最小工具。
 *
 * 背景：Supabase 免费额度出口流量超限后，REST / Auth 网关一律回 402
 * (exceed_egress_quota)，但直连 5432 的 pooler 不受影响。每日上传脚本的最后两步
 * (supabase.from("mods").select / .insert) 卡的正是这一层，所以改走这里。
 *
 * 与 backup-to-github.mjs 的既定做法保持一致，三件事必须保留：
 *   1. 查询结果一律用 -o 落盘再读文件，绝不走 stdout —— 5000 行中文经管道时
 *      多字节字符可能被切在 chunk 边界上，表现为标题静默乱码（见该文件 :315）。
 *   2. PGCLIENTENCODING=UTF8，否则 Windows 控制台代码页会让 psql 按 GBK 解码。
 *   3. 二进制路径可被 PG_PSQL_PATH 覆盖，CI 里指向固定版本。
 *
 * 不引入 pg 依赖：CLAUDE.md 禁止引入项目未使用的库，而 psql 随 PostgreSQL 一起装。
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PSQL_PATH = process.env.PG_PSQL_PATH?.trim() || "psql";

/** 读取 DATABASE_URL；缺失时直接退出，避免每个调用点各写一遍判断 */
export function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("❌ 缺少 DATABASE_URL（Supabase 直连串，5432 pooler，见 docs/disaster-recovery.md）");
    process.exit(1);
  }
  return url;
}

/**
 * 拆解连接串。密码单独放进 PGPASSWORD 环境变量，而不是拼进 argv ——
 * 进程列表对其他本机用户可见，argv 里的密码等同于明文公开。
 */
function parseDbUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error("❌ DATABASE_URL 不是合法 URL");
    process.exit(1);
  }
  return {
    dbName: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password || "") },
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username || "postgres"),
  };
}

let tempRoot = null;

/** 每次运行共用一个临时目录，退出时整体删掉 */
function tempDir() {
  if (!tempRoot) {
    tempRoot = mkdtempSync(join(tmpdir(), "wavemod-psql-"));
    process.on("exit", () => {
      try {
        rmSync(tempRoot, { force: true, recursive: true });
      } catch {
        // 临时目录清理失败不该影响主流程
      }
    });
  }
  return tempRoot;
}

function runPsql(args, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(PSQL_PATH, args, { env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.stdout?.resume(); // 结果已由 -o 落盘，stdout 丢弃即可
    child.on("error", (err) =>
      rejectPromise(
        err.code === "ENOENT"
          ? new Error(`找不到 psql（${PSQL_PATH}）。装 PostgreSQL 或设 PG_PSQL_PATH 指向可执行文件。`)
          : err
      )
    );
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`psql 退出码 ${code}: ${stderr.trim() || "(无 stderr)"}`));
    });
  });
}

/**
 * 执行一段 SQL 并把结果当 JSON 解析。
 *
 * 约定：SQL 必须以一条「产出单个 JSON 值」的 select 结尾，例如
 *   select coalesce(json_agg(json_build_object('title', title)), '[]'::json)::text from ...
 *   select json_build_object('inserted', (select count(*) from ins))::text
 * 产出为空时返回 null。
 *
 * 中文只走 -f 文件，绝不走 -c 命令行参数 —— PowerShell 5.1 会把非 ASCII
 * 按 GBK 转发给原生 exe，psql 报 invalid byte sequence for encoding "UTF8"。
 */
export async function psqlJson(sqlText) {
  const dir = tempDir();
  const sqlPath = join(dir, `q-${randomUUID()}.sql`);
  const outPath = join(dir, `q-${randomUUID()}.json`);
  writeFileSync(sqlPath, sqlText, "utf8");

  const { host, port, user, dbName, env } = parseDbUrl(requireDatabaseUrl());
  env.PGCLIENTENCODING = "UTF8";

  // -q 不能省：否则 psql 会把 BEGIN / ROLLBACK / INSERT 0 1 这类命令标签一并写进
  // -o 的输出文件，多语句 SQL（比如包事务做验证）的 JSON 解析必然失败。
  await runPsql(
    ["-h", host, "-p", port, "-U", user, "-d", dbName, "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-o", outPath, "-f", sqlPath],
    env
  );

  const raw = readFileSync(outPath, "utf8").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`psql 结果不是合法 JSON（前 200 字符）：${raw.slice(0, 200)}`);
  }
}

/**
 * 用 $tag$...$tag$ 包住任意文本。美元引用内部不做任何转义，因此标题里的
 * 单引号、反斜杠、换行都无需处理；只要 tag 本身不出现在正文里即可，
 * 撞了就加长 tag 重试。
 */
export function dollarQuote(text, base = "wm") {
  let tag = `$${base}$`;
  let attempt = 0;
  while (text.includes(tag)) {
    attempt += 1;
    tag = `$${base}${attempt}$`;
  }
  return `${tag}${text}${tag}`;
}
