/**
 * 把**本地**兜底快照发到腾讯 COS（再 ping 一次缓存失效）。
 *
 * 为什么需要：Supabase 网关被锁（exceed_egress_quota，REST/Auth 一律 402）时前台
 * 读的是兜底快照，而打包内那份只在构建时进得来 —— 运行中的部署读的是 COS 那份
 * （见 src/lib/mods-domain/snapshot.ts）。日常上传脚本会自己发布快照，这个 CLI 用于：
 *   1. 手工重导快照之后（先跑 scripts/export-mods-snapshot.ps1）
 *   2. 第一次把 COS 那份补上
 *
 * 用法:
 *   node scripts/publish-mods-snapshot-to-cos.mjs --dry-run   # 只看会传哪个 key、多大、行数
 *   node scripts/publish-mods-snapshot-to-cos.mjs             # 上传本地那份 + ping
 *   node scripts/publish-mods-snapshot-to-cos.mjs --export    # 先从库重导再上传（刚改过库就用这个）
 *   node scripts/publish-mods-snapshot-to-cos.mjs --no-ping   # 只上传，不清缓存
 *
 * 配 --export 时可调：`--timeout=<秒>`（单次导出的墙钟上限，默认 300）、
 * `--attempts=<次>`（含首次，默认 3）。本机链路差的时候把 timeout 调大。
 *
 * ⚠️ 不带 --export 时发的是**磁盘上那份**：刚入库的新 mod 不在里面，且它只会打印行数，
 * 不会替你判断新旧（2026-09-21 就在这上面踩过：以为在「让新内容可见」，其实又把旧快照发了一遍，
 * 还顺带 ping 清了缓存）。
 *
 * 顺序不能反：先上传再 ping。ping 会清掉快照缓存条目，若先 ping 后上传，
 * ping 之后第一个走到回退的请求会把 COS 上的旧对象重新缓存一整个 TTL。
 */

import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";

import {
  SNAPSHOT_EXPORT_ATTEMPTS,
  SNAPSHOT_EXPORT_TIMEOUT_MS,
  SNAPSHOT_REL_PATH,
  buildSnapshotCosUrl,
  exportModsSnapshot,
  notifyRevalidate,
  putSnapshotToCos,
} from "./mods-snapshot-export.mjs";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isNoPing = args.includes("--no-ping");
const isExport = args.includes("--export");

/**
 * `--timeout=<秒>` / `--attempts=<次>`：本机到 Supabase 的链路会时快时慢，
 * 默认的 300s 在坏窗口里连一轮都跑不完（2026-09-21 实测 265KB 要 24s）。
 * 慢的时候调大这里比反复重试划算 —— 重试也要从头再传一遍。
 */
function readPositiveIntArg(name, fallback) {
  const raw = args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`❌ ${name} 需要正整数，收到「${raw}」`);
    process.exit(1);
  }
  return value;
}

const exportTimeoutMs = readPositiveIntArg("--timeout", SNAPSHOT_EXPORT_TIMEOUT_MS / 1000) * 1000;
const exportAttempts = readPositiveIntArg("--attempts", SNAPSHOT_EXPORT_ATTEMPTS);

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://www.wave-mod.top";

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`❌ 缺少环境变量: ${missing.join(", ")}（本地在 .env.local）`);
    process.exit(1);
  }
}

/**
 * 上传前的自检：必须是能解开的 gzip、根节点是非空数组。
 *
 * 判据与 src/lib/mods-domain/snapshot-codec.ts 一致（scripts 无法 import TS）。
 * 传一份坏的上去比不传更糟 —— 前台会解不开、直接静默回退到打包内那份，
 * 看起来「上传成功了」却没有任何效果。
 */
function assertReadableSnapshot(body) {
  let parsed;
  try {
    parsed = JSON.parse(gunzipSync(body).toString("utf8"));
  } catch (err) {
    console.error(`❌ 本地快照不是合法 gzip+JSON: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error("❌ 本地快照根节点不是非空数组，拒绝上传");
    process.exit(1);
  }
  return parsed.length;
}

async function main() {
  const snapshotPath = resolve(process.cwd(), SNAPSHOT_REL_PATH);

  // --export：先从库重导（走共享模块 exportModsSnapshot，与上传脚本、每日备份 CI 同一条
  // 代码路径：含「行数骤降就拒绝写出」守卫 + 与旧快照逐字节比对），再走下面的上传流程。
  if (isExport) {
    requireEnv(["DATABASE_URL"]);
    // 全量导出是一个 5MB 上下的 JSON 值，慢链路上单次要几分钟；失败会自动重试，
    // 所以这里要先把预期讲清楚，否则「没输出」看起来就跟挂死一样。
    console.log(
      `⏳ 先从库重导快照（单次上限 ${exportTimeoutMs / 1000}s，最多 ${exportAttempts} 次）...`
    );
    await exportModsSnapshot({
      databaseUrl: process.env.DATABASE_URL.trim(),
      sqlPath: resolve(process.cwd(), "scripts/mods-snapshot.sql"),
      outPath: snapshotPath,
      rawPath: join(tmpdir(), "wavemod-snapshot-raw.json"),
      timeoutMs: exportTimeoutMs,
      attempts: exportAttempts,
      log: (line) => console.log(`  ${line}`),
    });
  }

  if (!existsSync(snapshotPath)) {
    console.error(`❌ 找不到本地快照: ${SNAPSHOT_REL_PATH}`);
    console.error("   先跑 powershell -File scripts/export-mods-snapshot.ps1 或加 --export");
    process.exit(1);
  }

  requireEnv(["COS_BUCKET", "COS_REGION"]);
  const bucket = process.env.COS_BUCKET.trim();
  const region = process.env.COS_REGION.trim();
  const url = buildSnapshotCosUrl({ bucket, region });

  const body = readFileSync(snapshotPath);
  const rowCount = assertReadableSnapshot(body);
  console.log(
    `📦 本地快照 ${SNAPSHOT_REL_PATH}: ${(body.length / 1024).toFixed(0)}KB, ${rowCount} 行` +
      `${isExport ? "（刚重导）" : "（磁盘上那份，未校验新旧）"}`
  );
  console.log(`   目标对象: ${url}`);

  if (isDryRun) {
    console.log("\n🔍 DRY-RUN：未上传。去掉 --dry-run 执行。");
    return;
  }

  requireEnv(["COS_SECRET_ID", "COS_SECRET_KEY"]);
  const cos = new COS({
    SecretId: process.env.COS_SECRET_ID.trim(),
    SecretKey: process.env.COS_SECRET_KEY.trim(),
  });

  await putSnapshotToCos({ cos, bucket, region, body });

  if (isNoPing) {
    console.log("（--no-ping：未通知前台清缓存，最多等一个 TTL 生效）");
    return;
  }

  // 必须在上传之后 —— 见文件头
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
  console.log(
    `ℹ️  发出去的是 ${rowCount} 行的快照；若刚刚改过库、而这里的行数与你预期的新总数不符，` +
      `说明发的是旧文件，加 --export 重导后再发。`
  );
}

main().catch((err) => {
  console.error(`❌ 发布失败: ${err.message}`);
  process.exit(1);
});
