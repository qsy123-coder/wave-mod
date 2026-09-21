/**
 * WaveMod 全量异地备份脚本（数据库 + mod 图片 → GitHub）
 *
 * 功能:
 *   1. pg_dump 数据库（public schema，custom 格式）→ backups/db/wavemod-<ts>.dump
 *   2. 刷新前台兜底快照 data/mods-snapshot.json.gz（见下方说明）
 *   3. 同步 COS 的 mods/ + tutorial/ 图片到 backups/images/（增量，比对 size + etag/md5）
 *   4. 生成 backups/manifest.json（备份清单，含表行数、图片完整索引、dump 校验值）
 *   5. dump 上传为 GitHub Release 附件（DB_DUMP_MODE=release，默认）或提交进 git（git）
 *   6. 图片 + manifest + 兜底快照 提交进 git 仓库并推送
 *
 * 关于兜底快照（2026-09-21 事故后新增）:
 *   Supabase 项目因超额被 restriction 时，REST/Auth 网关全站 402，前台会整片空白。
 *   src/lib/mods-domain/snapshot.ts 会在读失败时回退到 data/mods-snapshot.json.gz，
 *   那是网关被锁时唯一还能提供真实数据的来源 —— 因此必须随每日备份一起刷新，
 *   否则库里新增的 mod 永远进不了兜底路径。
 *
 * 用法:
 *   node scripts/backup-to-github.mjs [--dry-run] [--full] [--no-push]
 *                                     [--db-only] [--images-only] [--fast]
 *                                     [--concurrency=8] [--db-retention=7]
 *
 * 环境变量:
 *   DATABASE_URL        必填  Supabase Postgres 连接串（session pooler / direct，5432）
 *   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION   必填
 *   DB_DUMP_MODE        git | release（默认 release，dump 走 GitHub Release 防 git 膨胀）
 *   DB_RETENTION        保留最近 N 份 dump（默认 7）
 *   PG_DUMP_PATH / PG_RESTORE_PATH / PG_PSQL_PATH   pg 工具路径（默认取 PATH 中的同名二进制）
 *   GH_TOKEN            供 gh CLI 用（本机已登录则省略；Actions 用 secrets.GITHUB_TOKEN 自动注入）
 */

import { createClient } from "@supabase/supabase-js";
import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import { resolve, join, basename, dirname } from "node:path";
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync,
  readdirSync, statSync, createReadStream,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { checkSnapshotFreshness, snapshotStats } from "./snapshot-freshness.mjs";

// ── 加载 .env + .env.local ──
config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

// ── 常量与路径 ──
const ROOT = process.cwd();
const BACKUP_ROOT = resolve(ROOT, "backups");
const DB_DIR = resolve(BACKUP_ROOT, "db");
const IMG_DIR = resolve(BACKUP_ROOT, "images");
const TMP_DIR = resolve(BACKUP_ROOT, ".tmp");
const MANIFEST_PATH = resolve(BACKUP_ROOT, "manifest.json");

// 前台兜底快照（src/lib/mods-domain/snapshot.ts 运行时 fs 读取）
const DATA_DIR = resolve(ROOT, "data");
const SNAPSHOT_GZ = resolve(DATA_DIR, "mods-snapshot.json.gz");
const SNAPSHOT_SQL = resolve(ROOT, "scripts", "mods-snapshot.sql");
const SNAPSHOT_REL = "data/mods-snapshot.json.gz"; // git add / manifest 用的仓库相对路径
// 新快照行数低于旧快照此比例时判为导出异常，保留旧快照不覆盖
const SNAPSHOT_MIN_RATIO = 0.9;

const IMG_PREFIXES = ["mods/", "tutorial/"]; // 只备份这些前缀（mods 预览图 + 教程图），不含视频
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|flv|m4v|ts|3gp)$/i; // 视频扩展名，备份时跳过
const TABLES = [
  "mods", "profiles", "favorites", "likes", "comments", "comment_reactions", "ratings",
  "tutorial_configs", "tutorial_chapters", "tutorial_images", "tutorial_tools",
];

// ── 参数解析 ──
const args = process.argv.slice(2);
const FLAGS = {
  dryRun: args.includes("--dry-run"),
  full: args.includes("--full"),
  noPush: args.includes("--no-push"),
  dbOnly: args.includes("--db-only"),
  imagesOnly: args.includes("--images-only"),
  fast: args.includes("--fast"),
};
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const retentionArg = args.find((a) => a.startsWith("--db-retention="));
const CONCURRENCY = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 8;
const retentionFromArg = retentionArg ? Number(retentionArg.split("=")[1]) : null;

// ── env 校验 ──
const databaseUrl = process.env.DATABASE_URL?.trim();
const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
const dbDumpMode = (process.env.DB_DUMP_MODE?.trim() || "release").toLowerCase();
const dbRetention = retentionFromArg ?? Number(process.env.DB_RETENTION?.trim() || "7");
const pgDumpPath = process.env.PG_DUMP_PATH?.trim() || "pg_dump";
const pgRestorePath = process.env.PG_RESTORE_PATH?.trim() || "pg_restore";
// psql 只用于导出前台兜底快照；与 pg_dump 同理，CI 里显式指定 17 的二进制
const psqlPath = process.env.PG_PSQL_PATH?.trim() || "psql";

const needDb = !FLAGS.imagesOnly; // images-only 时不需要数据库
const needCos = !FLAGS.dbOnly; // db-only 时不需要 COS
const missing = [];
if (needDb && !databaseUrl) missing.push("DATABASE_URL（Supabase 连接串，见 docs/disaster-recovery.md 获取步骤）");
if (needCos) {
  for (const [k, v] of [["COS_SECRET_ID", cosSecretId], ["COS_SECRET_KEY", cosSecretKey], ["COS_BUCKET", cosBucket], ["COS_REGION", cosRegion]]) {
    if (!v) missing.push(k);
  }
}
if (missing.length > 0) {
  console.error("❌ 缺少环境变量：");
  missing.forEach((m) => console.error(`   - ${m}`));
  console.error("\n备份前请先在 .env.local 补齐，或在 GitHub Actions Secrets 配置。");
  process.exit(1);
}
if (!["git", "release"].includes(dbDumpMode)) {
  console.error(`❌ DB_DUMP_MODE 仅支持 git / release，当前值: ${dbDumpMode}`);
  process.exit(1);
}

// ── 客户端初始化 ──
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const projectRef = extractProjectRef(supabaseUrl);

// 表行数统计需要 supabase 客户端；没有则不统计（manifest 该字段为 null）
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey });

// ── 工具函数 ──

function extractProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "unknown";
  }
}

/** 时间戳：YYYYMMDD-HHmmss */
function timestamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** 执行子进程。默认继承 stdio（实时进度），inherit:false 时捕获 stdout+stderr */
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
      child.on("error", reject); // ENOENT: 工具不在 PATH
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`)));
    }
  });
}

/** 执行子进程并返回 stdout（+stderr 合并） */
function runOut(cmd, args) {
  return run(cmd, args, { inherit: false });
}

/** 文件 sha256 */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** 文件 md5（小图，用于与 COS etag 比对） */
function md5File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("md5");
    const stream = createReadStream(file);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** 标准化 COS etag：去引号、小写 */
function normEtag(etag) {
  return String(etag || "").replace(/^"/, "").replace(/"$/, "").toLowerCase();
}

/** 把 COS object key 转成安全的本地相对路径（Windows 非法字符 → _；原始 key 记录在 manifest 供恢复） */
function safeRelPath(key) {
  return String(key)
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/\s+$/g, "")
    .replace(/[.]+$/g, "");
}

/** 解析 COS object key 的 Content-Type */
function contentTypeFromKey(key) {
  const ext = key.split(".").pop()?.toLowerCase().split("?")[0];
  const map = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  return map[ext] || "application/octet-stream";
}

/** 递归列出 backups/images 下的文件：relPath -> size */
function walkImages(dir, base = "") {
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of walkImages(abs, rel)) map.set(k, v);
    } else if (entry.isFile()) {
      map.set(rel, statSync(abs).size);
    }
  }
  return map;
}

/** 指数退避重试 */
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

// ── 1. 数据库 dump ──

/** 解析连接串（密码经 env 传给 pg，不落命令行）。仅在需要数据库时调用 */
function parseDbUrl(url) {
  const u = new URL(url);
  const host = u.hostname;
  const port = u.port || "5432";
  const user = decodeURIComponent(u.username || "postgres");
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
  const password = decodeURIComponent(u.password || "");
  const env = { ...process.env, PGPASSWORD: password };
  return { host, port, user, dbName, env };
}

async function dumpDatabase(dumpFile) {
  mkdirSync(DB_DIR, { recursive: true });
  const { host, port, user, dbName, env } = parseDbUrl(databaseUrl);
  const dumpArgs = [
    "-h", host, "-p", port, "-U", user, "-d", dbName,
    "-Fc", "--no-owner", "--no-acl", "-v",
    "-n", "public",
    "-f", dumpFile,
  ];
  const label = `pg_dump → ${basename(dumpFile)}`;
  try {
    await run(pgDumpPath, dumpArgs, { env });
  } catch (err) {
    console.log(`  ⚠️ 首次 dump 失败（${err.message}），重试一次...`);
    await run(pgDumpPath, dumpArgs, { env });
  }
  // 校验：pg_restore --list 退出码 0 = 合法 custom 归档
  await run(pgRestorePath, ["--list", dumpFile], { env });
  const sha = await sha256File(dumpFile);
  const size = statSync(dumpFile).size;
  console.log(`  ✅ ${label}  ${(size / 1024 / 1024).toFixed(1)}MB  sha256=${sha.slice(0, 12)}…`);
  return { file: `db/${basename(dumpFile)}`, sha256: sha, sizeBytes: size };
}

// ── 1.5 前台兜底快照 ──

/**
 * 库里 is_published = true 的实时统计（行数 + 最新 created_at）。
 *
 * 单独查一次、而不是复用快照那次查询的产物：它要当**判定基准**。
 * 与快照同源的话，快照少读几行，基准也跟着少，永远判不出问题。
 */
async function fetchPublishedStats() {
  const { host, port, user, dbName, env } = parseDbUrl(databaseUrl);
  env.PGCLIENTENCODING = "UTF8";
  const out = await run(psqlPath, [
    "-h", host, "-p", port, "-U", user, "-d", dbName,
    "-t", "-A",
    // 纯 ASCII 的单值输出走 stdout 是安全的（只有多字节才必须 -o 落盘）。
    // 用 extract(epoch …) 而不是 created_at::text，避开 psql 的本地化时间格式。
    "-c", "select count(*)::text || '|' || coalesce(extract(epoch from max(created_at))::text, '') from mods where is_published = true",
  ], { env, inherit: false });

  // run(…, {inherit:false}) 把 stderr 也合进了 stdout，psql 的 NOTICE/WARNING
  // 可能混在前面 —— 取最后一个符合形状的行，而不是直接按第一个 | 切。
  // 用 /^\d+\|/ 而不是 /^\d+\|\d/：count 为 0 时行是 "0|"，也该被认出来，
  // 由判定函数给出「基准不可信」这个明确原因。
  const raw = String(out).trim();
  const line = raw.split(/\r?\n/).reverse().find((l) => /^\d+\|/.test(l.trim()));
  if (!line) {
    throw new Error(`库内已发布统计解析失败：${JSON.stringify(raw.slice(0, 120))}`);
  }
  const [countText, epochText] = line.trim().split("|");
  const epoch = epochText ? Number(epochText) : NaN;
  return {
    count: Number(countText),
    maxCreatedAt: Number.isFinite(epoch) ? epoch * 1000 : null,
  };
}

/**
 * 断言这份快照真的镜像了库里的已发布集合，不达标就抛。
 *
 * 判定逻辑在 scripts/snapshot-freshness.mjs（纯函数，有单测），这里只做 IO。
 */
async function assertSnapshotMirrorsDb(rows) {
  const db = await fetchPublishedStats();
  const verdict = checkSnapshotFreshness(snapshotStats(rows), db);
  if (!verdict.ok) {
    throw new Error(`快照与库内不一致：${verdict.reason}`);
  }
  console.log(`  ✅ 快照与库内一致（${db.count} 条已发布）`);
}

/**
 * 导出「已发布 mod」兜底快照 → data/mods-snapshot.json.gz（提交进仓库）。
 *
 * 前台在 Supabase HTTP 网关不可用时读这份快照，它是那时唯一还能提供真实数据的
 * 来源，所以必须随每日备份刷新，否则库里的新 mod 永远进不了兜底路径。
 *
 * 走 psql 直连 5432 而不是 supabase-js：网关正是可能被锁的那一层，且绕开它
 * 也就不消耗 Supabase 的出口流量配额（本次事故的起因就是配额超限）。
 *
 * 返回 { count, changed }；任何一步不达标都向上抛。调用方仍会先跑完 DB dump 和
 * 图片备份，但最后必须让 CI 翻红 —— 见 main() 收尾处的 snapshotFailure 判定。
 */
async function exportModsSnapshot() {
  if (!existsSync(SNAPSHOT_SQL)) {
    throw new Error(`找不到 ${SNAPSHOT_SQL}`);
  }
  const { host, port, user, dbName, env } = parseDbUrl(databaseUrl);
  env.PGCLIENTENCODING = "UTF8";

  const rawPath = join(TMP_DIR, "mods-snapshot.json");
  mkdirSync(TMP_DIR, { recursive: true });
  rmSync(rawPath, { force: true });

  // 结果用 -o 直接落盘，而不是捕获 stdout：这份 JSON 有 4.7MB 中文，
  // 走 stdout 时多字节字符可能被切在 chunk 边界上，让标题/简介静默乱码。
  await run(psqlPath, [
    "-h", host, "-p", port, "-U", user, "-d", dbName,
    "-t", "-A", "-o", rawPath, "-f", SNAPSHOT_SQL,
  ], { env });

  if (!existsSync(rawPath)) throw new Error("psql 未产出快照文件");
  const rawBuf = readFileSync(rawPath);
  const rows = JSON.parse(rawBuf.toString("utf8"));
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("快照为空，拒绝写出");
  }

  // 内容未变就不重写。不同 gzip 实现（CI 的 zlib / 本机脚本的 .NET）对同一份
  // 输入产出的字节不同，不做这层比对的话，500KB 的二进制会每天进一次 git 历史。
  //
  // 比对结果先存进 unchanged 再统一处理，而不是当场 return：下面的校验必须设在
  // try 之外 —— 放进 try 里的话，校验抛出的异常会被这个 catch 当成
  // 「旧快照损坏」吞掉，然后一路走到覆盖写出，把一次失败洗成成功。
  let prevCount = null;
  let unchanged = false;
  if (existsSync(SNAPSHOT_GZ)) {
    try {
      const prevBuf = gunzipSync(readFileSync(SNAPSHOT_GZ));
      prevCount = JSON.parse(prevBuf.toString("utf8")).length;
      unchanged = prevBuf.equals(rawBuf);
    } catch {
      // 旧快照损坏/读不了：继续走覆盖，下面照常写出新版本
    }
  }

  if (unchanged) {
    rmSync(rawPath, { force: true });
    console.log(`  ✅ 快照无变化（${rows.length} 条已发布），跳过写出`);
    // 内容与今天的新导出逐字节相同 ⇒ 磁盘上这份就是最新的。但仍要核对库内统计：
    // 万一这次的新导出本身就少读了几行，上面那条比对是发现不了的。
    await assertSnapshotMirrorsDb(rows);
    return { count: rows.length, changed: false };
  }

  // 上游查询被截断时 psql 依然退出 0，只留下一份"合法但少了几千行"的 JSON。
  // 兜底快照是网关被锁时唯一的数据源，写进残缺版本比不更新危险得多，故设下限。
  if (prevCount !== null && rows.length < prevCount * SNAPSHOT_MIN_RATIO) {
    rmSync(rawPath, { force: true });
    throw new Error(
      `新快照仅 ${rows.length} 条，旧快照 ${prevCount} 条（${((rows.length / prevCount) * 100).toFixed(1)}%），判为异常，保留旧快照`,
    );
  }

  const gz = gzipSync(rawBuf, { level: 9 });
  // 回读校验：写坏了会被前台当成"网关正常但没数据"，比不写更糟
  const roundTrip = JSON.parse(gunzipSync(gz).toString("utf8"));
  if (roundTrip.length !== rows.length) {
    throw new Error(`快照回读校验失败：${roundTrip.length} != ${rows.length}`);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const tmpGz = `${SNAPSHOT_GZ}.tmp`;
  writeFileSync(tmpGz, gz);
  renameSync(tmpGz, SNAPSHOT_GZ); // 原子替换，避免半截文件被 git 提交
  rmSync(rawPath, { force: true });

  // 写完再验一次。上面所有校验都只证明「文件没写坏」，这一条才证明「内容是当前库」。
  await assertSnapshotMirrorsDb(rows);

  const featured = rows.filter((r) => r.is_featured === true).length;
  console.log(`  ✅ ${SNAPSHOT_REL}  ${rows.length} 条已发布（推荐位 ${featured}）  ${(gz.length / 1024).toFixed(0)}KB`);
  return { count: rows.length, changed: true };
}

// ── 2. 图片增量同步 ──

/** 分页列出 bucket 中指定前缀的全部对象 */
async function listAll(prefix) {
  let marker = "";
  const out = [];
  let data;
  do {
    data = await new Promise((res, rej) =>
      cos.getBucket(
        { Bucket: cosBucket, Region: cosRegion, Prefix: prefix, Marker: marker, MaxKeys: 1000 },
        (err, d) => (err ? rej(err) : res(d)),
      ));
    for (const c of data.Contents ?? []) out.push({ key: c.Key, size: Number(c.Size), etag: c.ETag });
    marker = data.NextMarker ?? "";
  } while (String(data.IsTruncated) === "true");
  return out;
}

/** 下载单个 COS 对象到 backups/images/<rel>（先写 .tmp 再原子 rename，避免半截文件进 git） */
async function downloadObject(obj) {
  const rel = safeRelPath(obj.key);
  const destAbs = join(IMG_DIR, rel);
  const tmpAbs = join(TMP_DIR, rel);
  await retry(
    () =>
      new Promise((res, rej) => {
        cos.getObject(
          { Bucket: cosBucket, Region: cosRegion, Key: obj.key },
          (err, data) => {
            if (err) return rej(err);
            try {
              mkdirSync(dirname(tmpAbs), { recursive: true });
              writeFileSync(tmpAbs, data.Body);
              res();
            } catch (e) {
              rej(e);
            }
          },
        );
      }),
    { label: `下载 ${obj.key}` },
  );
  mkdirSync(dirname(destAbs), { recursive: true });
  renameSync(tmpAbs, destAbs);
}

/** 图片增量同步：列目录 + 比对，返回完整索引 / 待下载清单 / orphaned */
async function syncImages({ useMd5 }) {
  console.log("\n── 同步 COS 图片 ──");
  let remote = [];
  for (const prefix of IMG_PREFIXES) {
    const items = await listAll(prefix);
    remote.push(...items);
    console.log(`  📦 ${prefix} 共 ${items.length} 个对象`);
  }
  // 过滤：0 字节"文件夹占位对象"（会落盘成文件并堵住同名真实目录）+ 视频（约定只备图片）
  remote = remote.filter((o) => o.size > 0 && !VIDEO_EXT.test(o.key));
  const totalBytes = remote.reduce((s, o) => s + o.size, 0);
  console.log(`  📊 图片对象: ${remote.length}（已过滤 0 字节占位/视频），总大小: ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);

  if (remote.length === 0) {
    console.log("  ⚠️ COS 列表为空，跳过图片同步");
    return { remote, toDownload: [], orphaned: [] };
  }

  const localIndex = walkImages(IMG_DIR);
  const toDownload = [];
  const localKeys = new Set();

  for (const obj of remote) {
    const rel = safeRelPath(obj.key);
    localKeys.add(rel);
    const local = localIndex.get(rel);
    if (FLAGS.full) { toDownload.push({ ...obj, rel }); continue; }
    if (local === undefined) { toDownload.push({ ...obj, rel }); continue; }
    if (local !== obj.size) { toDownload.push({ ...obj, rel }); continue; }
    if (useMd5) {
      const md5 = await md5File(join(IMG_DIR, rel));
      if (md5 !== normEtag(obj.etag)) { toDownload.push({ ...obj, rel }); continue; }
    }
  }

  // orphaned：本地有、远程没有的（默认保留不删，防 COS 误删有保底）
  const orphaned = [...localIndex.keys()].filter((k) => !localKeys.has(k));

  console.log(`  ⬇️  待下载: ${toDownload.length}   |  本地孤儿(远程已无): ${orphaned.length}（保留不删）`);
  return { remote, toDownload, orphaned };
}

/** 并发下载待下载清单 */
async function downloadAll(toDownload) {
  let downloaded = 0;
  let failed = 0;
  const failures = [];
  let qi = 0;
  async function worker() {
    while (qi < toDownload.length) {
      const item = toDownload[qi++];
      try {
        await downloadObject(item);
        downloaded++;
        if (downloaded % 50 === 0) console.log(`   已下载 ${downloaded}/${toDownload.length}...`);
      } catch (e) {
        failed++;
        failures.push({ key: item.key, error: e.message });
        console.error(`    ❌ ${item.key}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { downloaded, failed, failures };
}

// ── 3. 表行数（manifest）──

async function tableCounts() {
  if (!supabase) return null;
  const counts = {};
  for (const t of TABLES) {
    try {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
      counts[t] = error ? null : count;
    } catch {
      counts[t] = null;
    }
  }
  return counts;
}

// ── 4. GitHub Release（DB_DUMP_MODE=release）──

async function uploadDumpToRelease(dumpFile, retention) {
  // tag 从 dump 文件名推导（wavemod-<ts>.dump → db-<ts>），与 restore 脚本的
  // 回退推断（dbMeta.file → db-<ts>）保持一致，即使 releaseUrl 缺失也能定位
  const ts = basename(dumpFile).match(/wavemod-(.+)\.dump$/)?.[1] || timestamp();
  const tag = `db-${ts}`;
  console.log(`\n── 上传 dump 到 GitHub Release ──`);
  await runOut("gh", ["release", "create", tag, "--title", `DB backup ${tag}`, "--notes", "auto", "--target", "main", dumpFile]);
  console.log(`  ✅ release ${tag} 已创建并上传`);
  // 清理超保留数的旧 db-* release
  const out = await runOut("gh", ["release", "list", "--limit", "100", "--json", "tagName,publishedAt"]);
  const releases = JSON.parse(out)
    .filter((r) => String(r.tagName).startsWith("db-"))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));
  const excess = releases.slice(0, Math.max(0, releases.length - retention));
  for (const r of excess) {
    console.log(`  🗑️  清理旧 release: ${r.tagName}`);
    await runOut("gh", ["release", "delete", r.tagName, "--yes", "--cleanup-tag"]);
  }
  return tag;
}

/** 从 git remote 推导 release URL */
async function releaseUrlOf(tag) {
  try {
    const origin = (await runOut("git", ["remote", "get-url", "origin"])).trim();
    const m = origin.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
    if (m) return `https://github.com/${m[1]}/${m[2]}/releases/tag/${tag}`;
  } catch { /* 忽略，releaseUrl 仅参考信息 */ }
  return null;
}

// ── 5. git 提交 ──

async function commitAndPush(commitMsg, branch) {
  if (FLAGS.noPush) {
    console.log("\n（--no-push 已指定，跳过 git 提交与推送）");
    return;
  }
  console.log("\n── git 提交与推送 ──");
  // release 模式下 dump 不进 git（防历史膨胀），只提交图片 + manifest + 兜底快照
  const addPaths = dbDumpMode === "release"
    ? ["backups/images", "backups/manifest.json", SNAPSHOT_REL]
    : ["backups/", SNAPSHOT_REL];
  // 快照刷新失败时文件可能不存在，git add 会因 pathspec 不匹配而整体失败
  const existingPaths = addPaths.filter((p) => existsSync(resolve(ROOT, p)));
  await run("git", ["add", ...existingPaths]);
  const changed = (await runOut("git", ["status", "--porcelain"])).trim();
  if (!changed) {
    console.log("  无变更，跳过提交");
    return;
  }
  await run("git", [
    "-c", "user.name=wavemod-backup",
    "-c", "user.email=backup@wavemod.local",
    "commit", "-m", commitMsg,
  ]);
  try {
    await run("git", ["pull", "--rebase", "--autostash", "origin", branch]);
  } catch (err) {
    console.error(`❌ push 前 rebase 失败，已中止（避免强推覆盖他人改动）: ${err.message}`);
    process.exit(1);
  }
  await run("git", ["push", "origin", branch]);
  console.log(`  ✅ 已推送到 origin/${branch}`);
}

// ── 主流程 ──

async function main() {
  const ts = timestamp();
  console.log(`═══════════════════════════════════════`);
  console.log(`  WaveMod 备份  ${ts}  模式=${dbDumpMode}`);
  console.log(`  dry-run=${FLAGS.dryRun}  full=${FLAGS.full}  并发=${CONCURRENCY}`);
  console.log(`  DB_RETENTION=${dbRetention}  项目 ref=${projectRef}`);
  console.log(`═══════════════════════════════════════\n`);

  if (FLAGS.dryRun) console.log("🔍 DRY-RUN 模式：仅预览（列目录/比对会执行，下载/上传/推送不会）。\n");

  mkdirSync(DB_DIR, { recursive: true });
  mkdirSync(IMG_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  // 1. 数据库 dump
  let dbInfo = null;
  if (!FLAGS.imagesOnly) {
    console.log("── 数据库 dump ──");
    const dumpFile = join(DB_DIR, `wavemod-${ts}.dump`);
    if (FLAGS.dryRun) {
      console.log(`  🔍 [DRY-RUN] 将执行 pg_dump → backups/db/wavemod-${ts}.dump（public schema, custom 格式）`);
    } else {
      dbInfo = await dumpDatabase(dumpFile);
    }
  }

  // 1.5 前台兜底快照（与 dump 共用 DATABASE_URL，直连 5432，不走被锁的 HTTP 网关）
  let snapshotInfo = null;
  let snapshotFailure = null;
  if (!FLAGS.imagesOnly) {
    console.log("\n── 前台兜底快照 ──");
    if (FLAGS.dryRun) {
      console.log(`  🔍 [DRY-RUN] 将执行 psql -f scripts/mods-snapshot.sql → ${SNAPSHOT_REL}`);
    } else {
      try {
        snapshotInfo = await exportModsSnapshot();
      } catch (err) {
        // 不在这里中断：DB dump 和图片备份才是真正的备份，不该被快照拖累。
        // 但也绝不能只打一行 ⚠️ 就过去 —— 此前正是「失败被吞掉 + 没有告警」，
        // 让 CI 全绿而前台内容静默冻结。失败先记下来，收尾时统一翻红。
        snapshotFailure = err;
        console.error(`  ⚠️ 快照刷新失败: ${err.message}`);
      }
    }
  }

  // 2. 图片增量同步
  let imageState = null;
  let imageResult = null;
  if (!FLAGS.dbOnly) {
    imageState = await syncImages({ useMd5: !FLAGS.dryRun && !FLAGS.fast });
    if (!FLAGS.dryRun && imageState.toDownload.length > 0) {
      console.log("\n── 下载缺失/变更图片 ──");
      imageResult = await downloadAll(imageState.toDownload);
    } else {
      imageResult = { downloaded: 0, failed: 0, failures: [] };
    }
  }

  // 3. 表行数
  const counts = FLAGS.dryRun ? null : await tableCounts();

  // 4. manifest
  // 快照在清单里留痕：成功留行数、失败留原因。否则「这次没变化」和「刷新失败」
  // 在 git 历史里长得一模一样（都是 snapshot 字段没有 refreshedThisRun）。
  const snapshotManifest = snapshotInfo
    ? {
        file: SNAPSHOT_REL,
        publishedRows: snapshotInfo.count,
        refreshedThisRun: snapshotInfo.changed,
      }
    : snapshotFailure
      ? { file: SNAPSHOT_REL, error: snapshotFailure.message }
      : null;

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      projectRef,
      cosBucket,
      cosRegion,
    },
    db: dbInfo
      ? {
          mode: dbDumpMode,
          file: dbInfo.file,
          sha256: dbInfo.sha256,
          sizeBytes: dbInfo.sizeBytes,
          releaseUrl: null,
          tableCounts: counts,
        }
      : null,
    // 前台兜底快照：网关被锁时前台就靠它，所以要在清单里留一行它当时的行数
    snapshot: snapshotManifest,
    images: imageState
      ? {
          remoteCount: imageState.remote.length,
          totalBytes: imageState.remote.reduce((s, o) => s + o.size, 0),
          downloadedThisRun: imageResult.downloaded,
          failedThisRun: imageResult.failed,
          failures: imageResult.failures,
          orphanedLocalCount: imageState.orphaned.length,
          entries: imageState.remote.map((o) => ({
            key: o.key,
            file: `images/${safeRelPath(o.key)}`,
            size: o.size,
            etag: o.etag,
          })),
        }
      : null,
  };

  // 5. dump 上传 Release
  if (!FLAGS.dryRun && dbInfo && dbDumpMode === "release") {
    const tag = await uploadDumpToRelease(join(DB_DIR, basename(dbInfo.file)), dbRetention);
    manifest.db.releaseUrl = await releaseUrlOf(tag);
  }

  // 6. 写 manifest
  if (!FLAGS.dryRun) {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`\n✅ manifest 已写入: backups/manifest.json`);
  }

  // 7. git 提交推送
  if (!FLAGS.dryRun) {
    const branch = await runOut("git", ["branch", "--show-current"]).then((s) => s.trim() || "main");
    const dbSum = dbInfo ? `db=${(dbInfo.sizeBytes / 1024).toFixed(0)}KB` : "db=skip";
    const imgSum = imageState ? `images=${imageResult.downloaded}` : "images=skip";
    const snapSum = snapshotInfo ? `snapshot=${snapshotInfo.count}${snapshotInfo.changed ? "" : "(unchanged)"}` : "snapshot=skip";
    await commitAndPush(`backup: ${ts} ${dbSum} ${imgSum} ${snapSum}`, branch);
  }

  // 8. 清理本地旧 dump（保留最近 N 份）
  if (!FLAGS.dryRun && !FLAGS.imagesOnly) {
    const dumps = readdirSync(DB_DIR).filter((f) => f.endsWith(".dump")).sort();
    const excess = dumps.slice(0, Math.max(0, dumps.length - dbRetention));
    for (const f of excess) rmSync(join(DB_DIR, f), { force: true });
    if (excess.length > 0) console.log(`\n🗑️  已清理本地旧 dump: ${excess.join(", ")}`);
  }

  // 9. 收尾判定：快照失败必须让这一步翻红。
  //    放在所有备份动作之后是刻意的 —— 当天的 DB dump 和图片要照常提交，
  //    不能因为兜底快照失败就把真正的备份一起丢掉。但「前台数据源过期」这件事
  //    必须有人看见，否则就是 CI 全绿、内容静默停更 —— 本次事故里最难发现的失效。
  if (snapshotFailure) {
    throw new Error(
      `前台兜底快照刷新失败（DB dump / 图片备份已完成）: ${snapshotFailure.message}`,
    );
  }

  console.log("\n═══════════════════════════════════════");
  console.log(FLAGS.dryRun ? "  DRY-RUN 完成。去掉 --dry-run 执行真实备份。" : "  备份完成 ✅");
  console.log("═══════════════════════════════════════\n");
}

// 直接执行才跑主流程；被 import 时只暴露函数，便于单独验证 exportModsSnapshot
// 这类"写坏了也不报错、只是静默发一份坏数据"的逻辑。
// fetchPublishedStats 一并导出，是为了能在不写任何文件的前提下核对
// "磁盘上这份快照 vs 库内实时统计" —— 判定基准出错的代价比快照出错还大。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("备份脚本出错:", err);
    process.exit(1);
  });
}

export { exportModsSnapshot, fetchPublishedStats };
