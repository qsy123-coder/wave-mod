/**
 * 按审阅台导出的 blur-jobs.json，**批量**把打码图覆盖回 COS 原对象。
 *
 * 与 overwrite-cos-image.mjs 的关系：那个是单张、按 URL 直接跑；
 * 这个吃一批，URL 全部来自清单（清单由 /tools/blur 导出），同样不查数据库。
 *
 * 用法：
 *   node scripts/overwrite-cos-images-batch.mjs --dir="D:\Downloads\blur-batch" --jobs="blur-jobs.json" --dry-run
 *   node scripts/overwrite-cos-images-batch.mjs --dir="D:\Downloads\blur-batch" --jobs="blur-jobs.json"
 *
 * 参数：
 *   --dir=<目录>     blur-batch.zip 解压出来的目录
 *   --jobs=<文件>    blur-jobs.json（{ jobs: [{ name, url }] }）
 *   --width=<n>      上传前缩到多宽（默认 1000，不放大）
 *   --keep-size      不缩放
 *   --concurrency=<n> 并发上传数（默认 4）
 *   --dry-run        只打印每条会覆盖哪个对象键
 *
 * 覆盖写同一个键的注意点与单张脚本一致：必须带 `Cache-Control: no-cache`，
 * 否则浏览器继续用缓存里的旧图（结论见 scripts/reupload-mod-image.mjs:170-173）。
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import {
  contentTypeForFormat,
  encodeFormatForKey,
  isImageObjectKey,
  parseCosObjectKey,
} from "./cos-object-key.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const DEFAULT_WIDTH = 1000;

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const dirArg = readArg("--dir")?.trim();
const jobsArg = readArg("--jobs")?.trim();
const dryRun = process.argv.includes("--dry-run");
const keepSize = process.argv.includes("--keep-size");
const width = Number(readArg("--width") ?? DEFAULT_WIDTH);
const concurrency = Math.max(1, Number(readArg("--concurrency") ?? 4));

if (!dirArg) fail('需要 --dir="<blur-batch.zip 解压目录>"');
if (!jobsArg) fail('需要 --jobs="<blur-jobs.json>"');
if (!Number.isFinite(width) || width <= 0) fail("--width 需要是正整数");

const dir = resolve(dirArg);
if (!existsSync(dir)) fail(`目录不存在：${dir}`);

const bucket = process.env.COS_BUCKET?.trim();
const region = process.env.COS_REGION?.trim();
if (!bucket || !region) fail("缺少 COS_BUCKET / COS_REGION（本地在 .env.local）");

const jobsPath = resolve(jobsArg);
if (!existsSync(jobsPath)) fail(`清单不存在：${jobsPath}`);
const parsed = JSON.parse(readFileSync(jobsPath, "utf8"));
const jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
if (!Array.isArray(jobs) || jobs.length === 0) fail("清单里没有 jobs");

/**
 * 重名直接拒绝：覆盖脚本是「按名字在解压目录里取图」，
 * 两个 job 同名就会把同一张打码图写进两个不同的对象键 —— 张冠李戴且不报错。
 * 旧版审阅台只取原图文件名（landscape.webp / preview.webp），很容易重名。
 */
const nameCounts = new Map();
for (const job of jobs) {
  if (job?.name) nameCounts.set(job.name, (nameCounts.get(job.name) ?? 0) + 1);
}
const duplicates = [...nameCounts].filter(([, count]) => count > 1);
if (duplicates.length > 0) {
  fail(
    `清单里有重名文件：${duplicates.map(([name, count]) => `${name} ×${count}`).join("、")}\n` +
      "   覆盖脚本按文件名取图，重名会把同一张图写进多个对象键。请用新版审阅台重新导出。"
  );
}

/** 一条任务的完整校验；返回错误字符串或 null */
function inspect(job) {
  if (!job?.name || !job?.url) return "缺少 name 或 url";
  if (!isImageObjectKey(job.name)) return `清单文件名不是图片：${job.name}`;
  const objectKey = parseCosObjectKey(job.url, bucket);
  if (!objectKey) return `无法从 URL 反推对象键：${job.url}`;
  if (!isImageObjectKey(objectKey)) return `对象键不是图片：${objectKey}`;
  const filePath = join(dir, job.name);
  if (!existsSync(filePath)) return `解压目录里没有这个文件：${job.name}`;
  return null;
}

const prepared = [];
for (const job of jobs) {
  const problem = inspect(job);
  if (problem) {
    console.error(`⚠️ 跳过 ${job?.name ?? "(无名)"}：${problem}`);
    continue;
  }
  prepared.push({ ...job, filePath: join(dir, job.name), objectKey: parseCosObjectKey(job.url, bucket) });
}

if (prepared.length === 0) fail("没有一条可执行的任务");

console.log(`共 ${jobs.length} 条，可执行 ${prepared.length} 条`);

if (dryRun) {
  for (const job of prepared) console.log(`   ${job.name}\n     → ${job.objectKey}`);
  console.log("\n🔍 DRY-RUN：未上传。确认对象键无误后去掉 --dry-run。");
  process.exit(0);
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID?.trim(),
  SecretKey: process.env.COS_SECRET_KEY?.trim(),
});

async function uploadOne(job) {
  const format = encodeFormatForKey(job.objectKey);
  let pipeline = sharp(readFileSync(job.filePath));
  if (!keepSize) pipeline = pipeline.resize({ width, withoutEnlargement: true });

  if (format === "png") pipeline = pipeline.png({ compressionLevel: 9 });
  else if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
  else pipeline = pipeline.webp({ quality: 92 });

  const body = await pipeline.toBuffer();

  await new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: job.objectKey,
        Body: body,
        ContentType: contentTypeForFormat(format),
        CacheControl: "no-cache",
      },
      (err) => {
        if (err) rejectPromise(new Error(err.message));
        else resolvePromise();
      }
    );
  });

  return body.length;
}

const succeeded = [];
const failed = [];

let cursor = 0;
async function worker() {
  while (cursor < prepared.length) {
    const job = prepared[cursor++];
    try {
      const bytes = await uploadOne(job);
      succeeded.push(job);
      console.log(`✅ ${job.name}  →  ${job.objectKey}  (${(bytes / 1024).toFixed(0)}KB)`);
    } catch (error) {
      failed.push({ job, message: error.message });
      console.error(`❌ ${job.name}：${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, prepared.length) }, () => worker()));

console.log(`\n成功 ${succeeded.length} / ${prepared.length}`);
if (failed.length > 0) {
  console.log("\n失败的：");
  for (const f of failed) console.log(`   ${f.job.name}：${f.message}`);
  process.exitCode = 1;
} else {
  console.log("URL 都没变，所以不用改库、不用发快照、也不用 ping。");
  console.log("⚠️ 卡片缩略图走 ?imageMogr2/... 的响应可能仍被 CDN 缓存，验收请开无痕窗口。");
}
