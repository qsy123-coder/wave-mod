/**
 * 把 `gamebanana_mods` 的兜底快照发到腾讯 COS（再 ping 一次缓存失效）。
 *
 * 与 scripts/publish-mods-snapshot-to-cos.mjs 同构，只是换了这一份快照的身份
 * （SQL / 对象键 / 打包内路径，见 scripts/gamebanana-snapshot.mjs）。
 * 读侧实现在 src/lib/gamebanana-domain/snapshot.ts。
 *
 * 用法:
 *   node scripts/publish-gamebanana-snapshot.mjs --dry-run   # 只看会传哪个 key、多大、行数
 *   node scripts/publish-gamebanana-snapshot.mjs --export    # 先从库重导再上传 + ping
 *   node scripts/publish-gamebanana-snapshot.mjs             # 上传磁盘上那份 + ping
 *   node scripts/publish-gamebanana-snapshot.mjs --no-ping   # 只上传，不清缓存
 *
 * 配 --export 时可调：`--timeout=<秒>`（单次导出的墙钟上限）、`--attempts=<次>`（含首次）。
 * 本机到 Supabase 的链路差的时候把 timeout 调大（见 mods-snapshot-export.mjs 的注释）。
 *
 * ⚠️ **第一次跑用 `--export`**：`data/gamebanana-snapshot.json.gz` 是随仓库提交的
 * 最后一道兜底，缺了它时「COS 也挂了」就没数据了。与 mods 那份不同，本表的写入
 * 频率极低（只有 sync-gamebanana.mjs），所以它不在每日备份 CI 的刷新范围内 ——
 * 库里有新内容时，要么跑 `sync-gamebanana.mjs`（它会自己发），要么来这里 `--export`。
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
  GAMEBANANA_SNAPSHOT_OBJECT_KEY,
  GAMEBANANA_SNAPSHOT_REL_PATH,
  exportGamebananaSnapshot,
} from "./gamebanana-snapshot.mjs";
import {
  SNAPSHOT_EXPORT_ATTEMPTS,
  SNAPSHOT_EXPORT_TIMEOUT_MS,
  buildSnapshotCosUrl,
  notifyRevalidate,
  putSnapshotToCos,
} from "./mods-snapshot-export.mjs";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isNoPing = args.includes("--no-ping");
const isExport = args.includes("--export");

/** 读 `--name=<正整数>` 形式的参数；给了非法值就退出，不静默用默认值 */
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
 * 判据与 src/lib/snapshot/codec.ts 一致（scripts 无法 import TS）。
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
  return parsed;
}

async function main() {
  const snapshotPath = resolve(process.cwd(), GAMEBANANA_SNAPSHOT_REL_PATH);

  if (isExport) {
    requireEnv(["DATABASE_URL"]);
    console.log(
      `⏳ 先从库重导 GameBanana 快照（单次上限 ${exportTimeoutMs / 1000}s，最多 ${exportAttempts} 次）...`
    );
    await exportGamebananaSnapshot({
      databaseUrl: process.env.DATABASE_URL.trim(),
      outPath: snapshotPath,
      rawPath: join(tmpdir(), "wavemod-gamebanana-snapshot-raw.json"),
      timeoutMs: exportTimeoutMs,
      attempts: exportAttempts,
      log: (line) => console.log(`  ${line}`),
    });
  }

  if (!existsSync(snapshotPath)) {
    console.error(`❌ 找不到本地快照: ${GAMEBANANA_SNAPSHOT_REL_PATH}`);
    console.error("   第一次跑请加 --export（先从库导一份出来）");
    process.exit(1);
  }

  requireEnv(["COS_BUCKET", "COS_REGION"]);
  const bucket = process.env.COS_BUCKET.trim();
  const region = process.env.COS_REGION.trim();
  const url = buildSnapshotCosUrl({
    bucket,
    region,
    objectKey: GAMEBANANA_SNAPSHOT_OBJECT_KEY,
  });

  const body = readFileSync(snapshotPath);
  const rows = assertReadableSnapshot(body);
  const hidden = rows.filter((r) => r.visibility === "hide").length;
  console.log(
    `📦 本地快照 ${GAMEBANANA_SNAPSHOT_REL_PATH}: ${(body.length / 1024).toFixed(0)}KB, ` +
      `${rows.length} 行（其中 hide ${hidden} 行）${isExport ? "（刚重导）" : "（磁盘上那份，未校验新旧）"}`
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

  // 直接上传，不用 publishGamebananaSnapshot —— 那个会**再导一次库**，
  // 而这份字节刚刚已经在上面校验过、且可能正是用户想发的磁盘上那份。
  await putSnapshotToCos({ cos, bucket, region, body, objectKey: GAMEBANANA_SNAPSHOT_OBJECT_KEY });

  if (isNoPing) {
    console.log("（--no-ping：未通知前台清缓存，最多等一个 TTL 生效）");
    return;
  }

  // 必须在上传之后 —— 见文件头
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
  console.log(
    `ℹ️  发出去的是 ${rows.length} 行的快照；若刚刚改过库、而这里的行数与你预期的新总数不符，` +
      `说明发的是旧文件，加 --export 重导后再发。`
  );
}

main().catch((err) => {
  console.error(`❌ 发布失败: ${err.message}`);
  process.exit(1);
});
