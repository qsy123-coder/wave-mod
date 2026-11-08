/**
 * 把抽卡分析用的角色/武器素材上传到 COS。
 *
 * 素材来自开源项目 juliy819/wuwa-gacha-tool-resources 的 release 资源包
 * （nanoka.cc 数据快照），本地解压后按 resourceId 命名，因此前台不需要
 * 「名字 → 图片」映射，直接按 ID 取，避免角色名对不上导致头像缺失。
 *
 * 对象键：
 *   gacha-res/icons/<resourceId>.webp      → 头像/武器图标（列表用）
 *   gacha-res/portraits/<resourceId>.webp  → 角色立绘（暂未使用，先备着）
 *
 * 用法：
 *   node scripts/upload-gacha-resources-to-cos.mjs --dir="<解压后的 resource-pack 目录>" --dry-run
 *   node scripts/upload-gacha-resources-to-cos.mjs --dir="<...>"
 *   node scripts/upload-gacha-resources-to-cos.mjs --dir="<...>" --force
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";

const cwd = process.cwd();

// Node 20.12+ 自带 loadEnvFile；解析失败（文件不存在）就跳过
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(resolve(cwd, file));
  } catch {
    // 没有这个文件就用已有环境变量
  }
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const DIR_ARG = [...args].find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length);

if (!DIR_ARG) {
  console.error('❌ 缺少 --dir="<解压后的 resource-pack 目录>"');
  process.exit(1);
}

const DIR = resolve(cwd, DIR_ARG);
const ICON_DIR = join(DIR, "icons");
const PORTRAIT_DIR = join(DIR, "portraits");

if (!existsSync(ICON_DIR)) {
  console.error(`❌ 目录不存在：${ICON_DIR}`);
  process.exit(1);
}

const BUCKET = process.env.COS_BUCKET?.trim();
const REGION = process.env.COS_REGION?.trim();
const SECRET_ID = process.env.COS_SECRET_ID?.trim();
const SECRET_KEY = process.env.COS_SECRET_KEY?.trim();

if (!BUCKET || !REGION || !SECRET_ID || !SECRET_KEY) {
  console.error("❌ 缺少 COS 环境变量：COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION");
  process.exit(1);
}

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY, Timeout: 60000 });

/** 与角色头像保持一致：素材不常变，长缓存 + 后台刷新 */
const CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";
const CONCURRENCY = 8;

function collect(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => [".webp", ".png"].includes(extname(name).toLowerCase()))
    .map((name) => ({
      localPath: join(dir, name),
      key: `gacha-res/${prefix}/${name}`,
      size: statSync(join(dir, name)).size,
    }));
}

const files = [...collect(ICON_DIR, "icons"), ...collect(PORTRAIT_DIR, "portraits")];
console.log(`准备上传 ${files.length} 个文件到 ${BUCKET}（${REGION}）`);

function headObject(key) {
  return new Promise((resolveHead) => {
    cos.headObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err) => {
      resolveHead(!err);
    });
  });
}

function putObject(key, body) {
  return new Promise((resolvePut, rejectPut) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: body,
        ContentType: "image/webp",
        CacheControl: CACHE_CONTROL,
      },
      (err, data) => (err ? rejectPut(err) : resolvePut(data)),
    );
  });
}

let uploaded = 0;
let skipped = 0;
let failed = 0;

async function worker(queue) {
  while (queue.length > 0) {
    const file = queue.shift();
    if (!file) return;

    try {
      const exists = await headObject(file.key);
      if (exists && !FORCE) {
        skipped += 1;
        console.log(`⏭  ${file.key}（已存在）`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`📤 ${file.key}（${Math.round(file.size / 1024)} KB）`);
        uploaded += 1;
        continue;
      }

      await putObject(file.key, readFileSync(file.localPath));
      uploaded += 1;
      console.log(`✅ ${file.key}`);
    } catch (error) {
      failed += 1;
      console.error(`❌ ${file.key}: ${error?.message ?? error}`);
    }
  }
}

const queue = [...files];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(
  `\n完成：上传/待上传 ${uploaded}，跳过 ${skipped}，失败 ${failed}${DRY_RUN ? "（dry-run，未实际写入）" : ""}`,
);
if (failed > 0) process.exit(1);
