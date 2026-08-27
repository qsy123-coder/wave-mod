/**
 * WaveMod 灾难恢复脚本（从 GitHub 备份恢复数据库 + 图片）
 *
 * 功能:
 *   1. 数据库恢复：定位 dump（release 模式先从 gh release 下载），sha256 校验，
 *      pg_restore 到目标库（只恢复 public schema，不碰 auth/storage 平台 schema）
 *   2. 图片恢复：遍历 manifest.images.entries，把 backups/images/<file> 回传 COS 相同 object key，
 *      数据库里存的 COS URL 即自动恢复生效（无需改库）
 *
 * ⚠️ 破坏性操作：数据库恢复会 DROP 并重建目标库的 public 表，需加 --yes 确认。
 *
 * 用法:
 *   node scripts/restore-from-backup.mjs [--db-only] [--images-only] [--dry-run]
 *                                        [--yes] [--restore-auth] [--concurrency=5]
 *
 * 环境变量:
 *   DATABASE_URL         目标库连接串（恢复目标；也可用 RESTORE_DATABASE_URL 覆盖）
 *   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION   图片回传目标
 *   PG_RESTORE_PATH      pg_restore 路径（默认 PATH）
 *   GH_TOKEN             供 gh 下载 release dump 用
 */

import { createClient } from "@supabase/supabase-js";
import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import { resolve, join } from "node:path";
import { readFileSync, existsSync, mkdirSync, statSync, createReadStream, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

// ── 加载 .env + .env.local ──
config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

// ── 参数解析 ──
const args = process.argv.slice(2);
const FLAGS = {
  dbOnly: args.includes("--db-only"),
  imagesOnly: args.includes("--images-only"),
  dryRun: args.includes("--dry-run"),
  yes: args.includes("--yes"),
  restoreAuth: args.includes("--restore-auth"),
};
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 5;

// ── env 校验 ──
const targetUrl = (process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL)?.trim();
const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
const pgRestorePath = process.env.PG_RESTORE_PATH?.trim() || "pg_restore";

const MANIFEST_PATH = resolve(process.cwd(), "backups", "manifest.json");
const ROOT = process.cwd();
const BACKUP_ROOT = resolve(ROOT, "backups");
const TMP_DIR = resolve(BACKUP_ROOT, ".tmp");

if (!existsSync(MANIFEST_PATH)) {
  console.error(`❌ 找不到备份清单: ${MANIFEST_PATH}`);
  console.error("   请先 clone 备份仓库（图片 + manifest），或确认在仓库根目录运行。");
  process.exit(1);
}

if (!FLAGS.imagesOnly) {
  if (!targetUrl) {
    console.error("❌ 缺少 DATABASE_URL / RESTORE_DATABASE_URL（恢复目标库连接串）");
    process.exit(1);
  }
  if (!FLAGS.yes && !FLAGS.dryRun) {
    console.error("❌ 数据库恢复是破坏性操作（DROP 并重建目标库 public 表）。");
    console.error("   确认要恢复请加 --yes；仅预览请用 --dry-run。");
    process.exit(1);
  }
}

if (!FLAGS.dbOnly) {
  const missing = [];
  for (const [k, v] of [["COS_SECRET_ID", cosSecretId], ["COS_SECRET_KEY", cosSecretKey], ["COS_BUCKET", cosBucket], ["COS_REGION", cosRegion]]) {
    if (!v) missing.push(k);
  }
  if (missing.length > 0) {
    console.error(`❌ 图片恢复缺少环境变量: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ── 读取 manifest ──
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
console.log(`📋 备份清单: ${manifest.generatedAt}`);
console.log(`   来源: project=${manifest.source?.projectRef}  cos=${manifest.source?.cosBucket}`);

// ── 工具函数 ──

function run(cmd, args, options = {}) {
  const capture = options.inherit === false;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      shell: false,
      stdio: capture ? "pipe" : "inherit",
      env: options.env || process.env,
    });
    if (capture) {
      let out = "";
      child.stdout?.on("data", (d) => (out += d));
      child.stderr?.on("data", (d) => (out += d));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(out) : reject(new Error(`${cmd} 退出码 ${code}`)));
    } else {
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`)));
    }
  });
}

function runOut(cmd, args) {
  return run(cmd, args, { inherit: false });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function retry(fn, { retries = 3, label = "操作" } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`  ⚠️ ${label} 失败（${err.message}），${delay / 1000}s 后重试 ${attempt + 1}/${retries}...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function contentTypeFromKey(key) {
  const ext = key.split(".").pop()?.toLowerCase().split("?")[0];
  const map = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  return map[ext] || "application/octet-stream";
}

// ── 1. 数据库恢复 ──

/** 定位并校验 dump 文件：release 模式先从 gh release 下载到 .tmp */
async function locateDump() {
  const dbMeta = manifest.db;
  if (!dbMeta?.file) {
    console.error("❌ manifest 中没有数据库备份记录（可能当时只备份了图片）");
    return null;
  }

  const tagFromUrl = (dbMeta.releaseUrl || "").match(/\/releases\/tag\/(.+)$/)?.[1] || null;
  let dumpFile = join(BACKUP_ROOT, dbMeta.file);

  if (!existsSync(dumpFile) && dbMeta.mode === "release") {
    // 本地没有 → 从 release 下载
    const tag = tagFromUrl || (dbMeta.file.match(/wavemod-(.+)\.dump$/)?.[1] ? `db-${dbMeta.file.match(/wavemod-(.+)\.dump$/)[1]}` : null);
    if (!tag) {
      console.error(`❌ 无法从 releaseUrl 推断 release tag: ${dbMeta.releaseUrl}`);
      return null;
    }
    console.log(`  ⬇️  从 release 下载 dump: ${tag}`);
    mkdirSync(TMP_DIR, { recursive: true });
    await runOut("gh", ["release", "download", tag, "--pattern", "*.dump", "--dir", TMP_DIR]);
    const downloaded = readdirSync(TMP_DIR).filter((f) => f.endsWith(".dump"));
    if (downloaded.length === 0) throw new Error("release 中未找到 .dump 文件");
    dumpFile = join(TMP_DIR, downloaded[0]);
  }

  if (!existsSync(dumpFile)) {
    console.error(`❌ 找不到 dump 文件: ${dumpFile}`);
    console.error("   - git 模式：确认 backups/db/ 已提交并在本地存在");
    console.error("   - release 模式：确认能从 GitHub 下载");
    return null;
  }

  // sha256 校验（manifest 记录的值）
  const sha = await sha256File(dumpFile);
  if (dbMeta.sha256 && sha !== dbMeta.sha256) {
    console.error(`❌ dump 校验失败：sha256 不匹配。文件可能损坏或被篡改。`);
    console.error(`   期望 ${dbMeta.sha256}`);
    console.error(`   实际 ${sha}`);
    return null;
  }
  console.log(`  ✅ dump 校验通过 (sha256=${sha.slice(0, 12)}…)  ${(statSync(dumpFile).size / 1024 / 1024).toFixed(1)}MB`);
  return dumpFile;
}

async function restoreDb(dumpFile) {
  console.log("\n── 恢复数据库（public schema）──");
  const u = new URL(targetUrl);
  const host = u.hostname;
  const port = u.port || "5432";
  const user = decodeURIComponent(u.username || "postgres");
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
  const password = decodeURIComponent(u.password || "");
  const env = { ...process.env, PGPASSWORD: password };

  const args = [
    "-h", host, "-p", port, "-U", user, "-d", dbName,
    "--clean", "--if-exists",
    "--no-owner", "--no-privileges",
    "--exit-on-error",
    "-n", "public",
    dumpFile,
  ];
  if (FLAGS.restoreAuth) {
    args.splice(args.indexOf("-n"), 0, "-n", "auth"); // 追加 auth schema（高级，默认关）
  }
  console.log(`  pg_restore → ${host}/${dbName}`);
  await run(pgRestorePath, args, { env });
  console.log("  ✅ 数据库恢复完成");
}

// ── 2. 图片恢复（回传 COS）──

async function restoreImages() {
  console.log("\n── 恢复图片（回传 COS 相同 object key）──");
  const entries = manifest.images?.entries || [];
  if (entries.length === 0) {
    console.log("  ⚠️ manifest 中没有图片索引");
    return;
  }

  const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey });
  let ok = 0, missing = 0, failed = 0;
  const failures = [];
  let qi = 0;

  async function worker() {
    while (qi < entries.length) {
      const e = entries[qi++];
      const local = join(BACKUP_ROOT, e.file);
      if (!existsSync(local)) { missing++; continue; }
      try {
        await retry(
          () =>
            new Promise((res, rej) => {
              cos.putObject(
                {
                  Bucket: cosBucket,
                  Region: cosRegion,
                  Key: e.key,
                  Body: readFileSync(local),
                  ContentType: contentTypeFromKey(e.key),
                  CacheControl: "max-age=31536000",
                },
                (err) => (err ? rej(new Error(err.message)) : res()),
              );
            }),
          { label: `上传 ${e.key}` },
        );
        ok++;
        if (ok % 100 === 0) console.log(`   已回传 ${ok}/${entries.length}...`);
      } catch (err) {
        failed++;
        failures.push({ key: e.key, error: err.message });
        console.error(`    ❌ ${e.key}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\n  ✅ 图片回传完成: 成功 ${ok} | 本地缺失 ${missing} | 失败 ${failed}`);
  if (failures.length > 0) {
    console.log("  失败明细:");
    failures.slice(0, 20).forEach((f) => console.log(`    - ${f.key}: ${f.error}`));
    if (failures.length > 20) console.log(`    ... 共 ${failures.length} 条失败`);
  }
}

// ── 主流程 ──

async function main() {
  console.log(`═══════════════════════════════════════`);
  console.log(`  WaveMod 恢复  dry-run=${FLAGS.dryRun}`);
  console.log(`  模式: ${FLAGS.dbOnly ? "仅数据库" : FLAGS.imagesOnly ? "仅图片" : "数据库 + 图片"}`);
  console.log(`═══════════════════════════════════════\n`);

  if (FLAGS.dryRun) console.log("🔍 DRY-RUN 模式：仅预览要执行的动作。\n");

  if (!FLAGS.imagesOnly) {
    const dumpFile = FLAGS.dryRun ? null : await locateDump();
    if (FLAGS.dryRun) {
      console.log(`  🔍 [DRY-RUN] 将恢复数据库到 ${new URL(targetUrl).hostname}（DROP 重建 public 表）`);
    } else if (dumpFile) {
      await restoreDb(dumpFile);
    }
  }

  if (!FLAGS.dbOnly) {
    const count = manifest.images?.entries?.length || 0;
    if (FLAGS.dryRun) {
      console.log(`\n  🔍 [DRY-RUN] 将回传 ${count} 张图片到 cos://${cosBucket}`);
    } else {
      await restoreImages();
    }
  }

  // 抽查恢复后的图片 URL
  if (!FLAGS.dryRun && !FLAGS.dbOnly && !FLAGS.imagesOnly && manifest.images?.entries?.length) {
    console.log("\n── 抽查图片 URL 可用性 ──");
    const samples = manifest.images.entries.slice(0, 3);
    for (const e of samples) {
      const url = `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${e.key}`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        console.log(`  ${res.ok ? "✅" : "❌"} ${res.status} ${e.key}`);
      } catch (err) {
        console.log(`  ❌ ${e.key}: ${err.message}`);
      }
    }
  }

  console.log("\n═══════════════════════════════════════");
  console.log(FLAGS.dryRun ? "  DRY-RUN 完成。去掉 --dry-run 执行真实恢复。" : "  恢复完成 ✅");
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("恢复脚本出错:", err);
  process.exit(1);
});
