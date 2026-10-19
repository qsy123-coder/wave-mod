/**
 * 把 public/character-imgs 的角色头像上传到 COS，供前台直接走 COS/CDN。
 *
 * 背景：手机上角色头像一直是「香港 nginx → Vercel hkg1」的同源请求，单张缓存命中
 * 也要 0.45–0.85s，并发 12 张时尾部 1.5–2s。卡片图本来就在 COS 上（~284ms），
 * 头像搬到同一个桶后，两者同源、可复用 HTTP/2 连接，且不再经过 Vercel 函数。
 *
 * 对象键 = `character-imgs/<原文件名>`，保留中文原名；前台用 encodeURIComponent 编码。
 * 这是幂等的：已存在的键默认跳过，`--force` 才覆盖。
 *
 * 用法：
 *   node scripts/upload-character-avatars-to-cos.mjs --dry-run
 *   node scripts/upload-character-avatars-to-cos.mjs
 *   node scripts/upload-character-avatars-to-cos.mjs --force
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");

const BUCKET = process.env.COS_BUCKET?.trim();
const REGION = process.env.COS_REGION?.trim();
const SECRET_ID = process.env.COS_SECRET_ID?.trim();
const SECRET_KEY = process.env.COS_SECRET_KEY?.trim();

if (!BUCKET || !REGION || !SECRET_ID || !SECRET_KEY) {
  console.error("❌ 缺少 COS 环境变量：COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION");
  process.exit(1);
}

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY, Timeout: 60000 });

/** 与 src/lib/cos/shared.ts 的 COS_IMAGE_CACHE_CONTROL 保持一致 */
const CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const DIR = join(process.cwd(), "public", "character-imgs");

if (!existsSync(DIR)) {
  console.error(`❌ 目录不存在：${DIR}`);
  process.exit(1);
}

const files = readdirSync(DIR)
  .filter((name) => CONTENT_TYPES[extname(name).toLowerCase()])
  .sort((a, b) => a.localeCompare(b, "zh-CN"));

function headObject(key) {
  return new Promise((resolveHead) => {
    cos.headObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err) => {
      resolveHead(!err);
    });
  });
}

function putObject(key, body, contentType) {
  return new Promise((resolvePut, rejectPut) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      },
      (err, data) => (err ? rejectPut(new Error(err.message)) : resolvePut(data)),
    );
  });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const totalBytes = files.reduce((sum, name) => sum + statSync(join(DIR, name)).size, 0);
console.log(`📦 头像 ${files.length} 个 / ${(totalBytes / 1024).toFixed(1)}KB`);
console.log(`🎯 目标：cos://${BUCKET}/character-imgs/ (${REGION})${DRY_RUN ? "  [DRY-RUN]" : ""}`);

let uploaded = 0;
let skipped = 0;
let failed = 0;

await mapLimit(files, 8, async (filename) => {
  const key = `character-imgs/${filename}`;
  const exists = await headObject(key);
  if (exists && !FORCE) {
    skipped++;
    return;
  }

  if (DRY_RUN) {
    uploaded++;
    return;
  }

  try {
    await putObject(key, readFileSync(join(DIR, filename)), CONTENT_TYPES[extname(filename).toLowerCase()]);
    uploaded++;
    if (uploaded % 20 === 0) console.log(`  已上传 ${uploaded} 个…`);
  } catch (error) {
    failed++;
    console.error(`  ❌ ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
});

console.log(`\n✅ 上传 ${uploaded} / 跳过 ${skipped} / 失败 ${failed}`);

const sample = files[0];
if (sample) {
  const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/character-imgs/${encodeURIComponent(sample)}`;
  console.log(`示例：${url}`);
}
