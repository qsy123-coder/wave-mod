/**
 * 把本地的 .env.production 同步到 Vercel 项目（preview / production）。
 *
 * 为什么要有这个脚本：项目的环境变量有 28 个（Supabase / COS / 阿里云短信 / 数据库…），
 * 手工在面板里一个个贴既慢又容易贴错；而部署到 Vercel 后缺任何一个都会静默降级
 * （最典型的是 COS_BUCKET 缺失 → 图库回落本地路径 → 线上 404）。
 *
 * 前提：本机已 `npx vercel login`，且当前目录已 link 到目标项目（.vercel/project.json）。
 *
 * 用法：
 *   node scripts/sync-env-to-vercel.mjs --dry-run            # 只看要推哪些变量名
 *   node scripts/sync-env-to-vercel.mjs --target=preview     # 只推 preview
 *   node scripts/sync-env-to-vercel.mjs --target=both        # preview + production（默认）
 *
 * 安全性：值通过 **stdin** 传给 `vercel env add`，不出现在进程命令行里，
 * 也不会被打印。脚本只回显变量名。
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const targetArg = [...args].find((arg) => arg.startsWith("--target="));
const TARGET = targetArg ? targetArg.split("=")[1] : "both";

if (!["preview", "production", "both"].includes(TARGET)) {
  console.error("❌ --target 只能是 preview / production / both");
  process.exit(1);
}

const ENV_PATH = resolve(process.cwd(), ".env.production");
if (!existsSync(ENV_PATH)) {
  console.error(`❌ 找不到 ${ENV_PATH}`);
  process.exit(1);
}

/** 极简 dotenv 解析：只处理 KEY=VALUE、忽略注释与空行，保留值里的 `=` 与引号内空格 */
function parseEnv(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    entries.push({ key, value });
  }
  return entries;
}

const entries = parseEnv(readFileSync(ENV_PATH, "utf8"));
const targets = TARGET === "both" ? ["preview", "production"] : [TARGET];

console.log(`📋 ${ENV_PATH} 共 ${entries.length} 个变量 → 目标：${targets.join(" + ")}${DRY_RUN ? "（DRY-RUN）" : ""}`);

if (DRY_RUN) {
  console.log(entries.map((entry) => `   ${entry.key}`).join("\n"));
  process.exit(0);
}

let ok = 0;
let failed = 0;

for (const target of targets) {
  for (const { key, value } of entries) {
    // --force 覆盖已存在的同名变量；值走 stdin，避免出现在命令行/进程列表
    const result = spawnSync("npx", ["vercel", "env", "add", key, target, "--force"], {
      input: `${value}\n`,
      encoding: "utf8",
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status === 0) {
      ok += 1;
      console.log(`   ✅ ${target}/${key}`);
    } else {
      failed += 1;
      const message = (result.stderr || result.stdout || "").trim().split("\n").slice(-2).join(" ");
      console.error(`   ❌ ${target}/${key}: ${message}`);
    }
  }
}

console.log(`\n完成：成功 ${ok}，失败 ${failed}`);
if (failed > 0) process.exitCode = 1;
