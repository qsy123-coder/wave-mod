/**
 * 把「图库」图片上传到腾讯云 COS —— 让 /gallery 直接吃 COS，不再依赖服务器本地文件。
 *
 * 为什么必须做（2026-10-18 实测首尔机 nginx 日志）：
 *   图库图片占健康日 **75% 的出向带宽**（5.2GB 里 3.9GB），且 `public/gallery` 是运行时
 *   读本地文件的依赖 —— 搬到 Vercel（无状态、无持久盘）后这条路直接不存在。
 *
 * 对象键 = `gallery/<原文件名>`，**保留原名**（含中文、空格）。COS 允许 UTF-8 键，
 * 前端用 encodeURIComponent 逐段编码；改成 slug 会让中文名用户下载到的文件名对不上。
 *
 * 用法：
 *   node scripts/upload-gallery-to-cos.mjs --dry-run   # 只列清单，不传
 *   node scripts/upload-gallery-to-cos.mjs             # 上传（已存在则跳过）
 *   node scripts/upload-gallery-to-cos.mjs --force     # 覆盖重传
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";

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

const GALLERY_DIR = join(process.cwd(), "public", "gallery");
const CONFIG_PATH = join(process.cwd(), "data", "gallery-images.json");

function contentTypeFor(filename) {
  return CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function headObject(key) {
  return new Promise((resolveHead) => {
    cos.headObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err, data) => {
      resolveHead({ exists: !err, size: data?.headers?.["content-length"] });
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

/** 小并发池：COS 上传是网络 IO，8 路足够又不会把家里带宽打满 */
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

const entries = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
const filenames = [...new Set(entries.map((entry) => entry.filename))];

const missingLocal = filenames.filter((name) => !existsSync(join(GALLERY_DIR, name)));
if (missingLocal.length > 0) {
  console.warn(`⚠️ 本地缺 ${missingLocal.length} 张：${missingLocal.slice(0, 5).join(" / ")}${missingLocal.length > 5 ? " …" : ""}`);
}

const targets = filenames.filter((name) => existsSync(join(GALLERY_DIR, name)));
const totalBytes = targets.reduce((sum, name) => sum + statSync(join(GALLERY_DIR, name)).size, 0);

console.log(
  `📦 图库 ${entries.length} 条配置 / ${targets.length} 个文件 / ${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
);
console.log(`🎯 目标：cos://${BUCKET}/gallery/  (${REGION})${DRY_RUN ? "  [DRY-RUN]" : ""}`);

let uploaded = 0;
let skipped = 0;
let failed = 0;
let uploadedBytes = 0;

await mapLimit(targets, 8, async (filename, index) => {
  const key = `gallery/${filename}`;

  if (!FORCE && !DRY_RUN) {
    const head = await headObject(key);
    if (head.exists) {
      skipped += 1;
      return;
    }
  }

  if (DRY_RUN) {
    if (index < 10) console.log(`   → ${key}`);
    return;
  }

  try {
    const body = readFileSync(join(GALLERY_DIR, filename));
    await putObject(key, body, contentTypeFor(filename));
    uploaded += 1;
    uploadedBytes += body.length;
    if (uploaded % 20 === 0) console.log(`   … 已上传 ${uploaded}`);
  } catch (error) {
    failed += 1;
    console.error(`   ❌ ${filename}: ${error.message}`);
  }
});

if (DRY_RUN) {
  console.log(`\n🔍 DRY-RUN：将上传 ${targets.length} 个文件（${(totalBytes / 1024 / 1024).toFixed(1)}MB），未执行。`);
} else {
  console.log(
    `\n✅ 完成：上传 ${uploaded}（${(uploadedBytes / 1024 / 1024).toFixed(1)}MB）/ 跳过 ${skipped} / 失败 ${failed}`,
  );
}

if (failed > 0) process.exitCode = 1;
