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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 解析 psql 可执行文件路径。
 *
 * 必须**惰性**求值（每次调用现算），不能在模块加载时算一次：
 * upload-daily-by-date.mjs 的 `import { psqlJson }` 早于它的 dotenv `config()`，
 * 模块加载时求值的话永远拿不到 .env.local 里的 PG_PSQL_PATH。
 */
export function resolvePsqlPath(override) {
  return override?.trim() || process.env.PG_PSQL_PATH?.trim() || "psql";
}

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

function runPsql(args, env, psqlOverride, timeoutMs = 0) {
  const psqlPath = resolvePsqlPath(psqlOverride);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(psqlPath, args, { env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    // 墙钟超时：连接被中途黑洞掉（丢包但没有 RST）时 psql 会一直等下去，
    // 而 -o 的输出要等整个查询结束才落盘 ⇒ 外部看到的是「永远没反应也没有报错」。
    // 失败比挂着好：调用方还能重试。
    let timedOut = false;
    const killer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, timeoutMs)
        : null;

    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.stdout?.resume(); // 结果已由 -o 落盘，stdout 丢弃即可
    child.on("error", (err) => {
      if (killer) clearTimeout(killer);
      rejectPromise(
        err.code === "ENOENT"
          ? new Error(`找不到 psql（${psqlPath}）。装 PostgreSQL 或设 PG_PSQL_PATH 指向可执行文件。`)
          : err
      );
    });
    child.on("close", (code) => {
      if (killer) clearTimeout(killer);
      if (timedOut) rejectPromise(new Error(`psql 超时（超过 ${timeoutMs / 1000}s 未返回），已终止`));
      else if (code === 0) resolvePromise();
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
 * 执行一段（或一个 SQL 文件里的）SQL，把 psql 的原始输出落到 outPath，
 * **不做任何解析**，返回 outPath。
 *
 * 与 psqlJson 的唯一区别就是不 JSON.parse：导出兜底快照时必须拿到 psql 写出的
 * 原始字节，才能与上一份逐字节比对（决定要不要重写 .gz）。parse 再 stringify
 * 会把字节重新塑形，比对就不可靠了。
 *
 * ⚠️ 调用前先删 outPath。psql 失败时不会创建/截断输出文件，上一次运行留下的
 * **陈旧结果**会原地不动，调用方会把旧快照当新快照发出去 —— 静默发错比崩溃难查。
 *
 * databaseUrl 缺失时**抛错而不是 process.exit**：本函数供 CI 之外的分支逻辑调用
 * （是否继续、退出码是几由调用方决定），exit 会把控制权从这里夺走。
 * CLI 需要「缺了就退出」的语义时用 requireDatabaseUrl()。
 *
 * @param {number} [input.timeoutMs] 墙钟上限；超时杀掉 psql 并抛错（0 = 不限制）。
 *   只用在大导出上：连接被黑洞掉时它会无限期挂着，而挂着比失败更难处理。
 * @returns {Promise<string>} outPath
 */
export async function psqlToFile({ databaseUrl, outPath, sqlPath, sqlText, psqlPath, timeoutMs = 0 }) {
  const url = databaseUrl?.trim();
  if (!url) {
    throw new Error("psqlToFile 需要 databaseUrl（Supabase 直连串，5432 pooler）");
  }

  const { host, port, user, dbName, env } = parseDbUrl(url);
  env.PGCLIENTENCODING = "UTF8";

  let effectiveSqlPath = sqlPath;
  if (!effectiveSqlPath) {
    // 中文只走 -f 文件，绝不走 -c 命令行参数（理由见 psqlJson）
    effectiveSqlPath = join(tempDir(), `q-${randomUUID()}.sql`);
    writeFileSync(effectiveSqlPath, sqlText ?? "", "utf8");
  }

  rmSync(outPath, { force: true });

  await runPsql(
    ["-h", host, "-p", port, "-U", user, "-d", dbName, "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-o", outPath, "-f", effectiveSqlPath],
    env,
    psqlPath,
    timeoutMs
  );

  if (!existsSync(outPath)) {
    throw new Error(`psql 未产出输出文件（${outPath}）`);
  }

  return outPath;
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
