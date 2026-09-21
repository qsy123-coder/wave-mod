/**
 * 换掉某个 mod 的预览图：拿源目录里的图 → sharp 转 webp → 覆盖 COS 上**同一个对象键**。
 *
 * 为什么单独一个脚本：上传脚本只在**入库那一刻**传图，之后你把源图换掉（改图、修错图），
 * 库里存的是 URL、不是图，重跑上传脚本会被去重跳过（`character|title` 已存在）——
 * 于是「图改了但线上没变」。2026-09-21 的实例：两张 png 在上传后 45 分钟被替换，
 * 线上仍是旧图，只能靠重传修。
 *
 * ⚠️ 对象键**从库内那一行的 images[0] 反推**，不自己拼：
 *   1. 保证覆盖的正是前台在读的那张（拼错前缀就会「传成功了但没人看它」）；
 *   2. 键里含 slugify(character) 与行 id 两段易变逻辑，重算一份就是第二处真源。
 * 因此本脚本**不改库、不发快照、不 ping** —— URL 没变，前台不需要任何通知。
 * 只有浏览器/图片优化器那边的缓存要等（见 --no-cache 说明）。
 *
 * 用法:
 *   node scripts/reupload-mod-image.mjs --key="卡提希娅-大卡-艾男漂草（567890=【】p切换）" --dry-run
 *   node scripts/reupload-mod-image.mjs --key="卡提希娅-大卡-艾男漂草（567890=【】p切换）"
 *   node scripts/reupload-mod-image.mjs --key="…" --file="D:\path\to\other.png"   # 不用源目录里的同名图
 *   node scripts/reupload-mod-image.mjs --key="…" --id=d58ed881-…                # 直接指定行 id
 *
 * --key 就是源目录里的文件名（去掉扩展名），也是分享链接的名字。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import { resolveDakaTarget } from "./daka-classify.mjs";
import { dollarQuote, psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

/** 与 upload-daka.mjs / upload-daily-by-date.mjs 同一套转换参数（750px webp q80） */
const WEBP_WIDTH = 750;
const WEBP_QUALITY = 80;
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
/** 源目录默认与 upload-daka.mjs 一致；本批次是扁平目录 */
const DEFAULT_DIR = String.raw`D:\BaiduNetdiskDownload\大卡`;

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const key = readArg("--key")?.trim();
const explicitFile = readArg("--file")?.trim();
const explicitId = readArg("--id")?.trim();
const sourceDir = readArg("--dir")?.trim() || DEFAULT_DIR;
const isDryRun = process.argv.includes("--dry-run");

if (!key && !explicitId) {
  console.error('❌ 需要 --key="源目录里的文件名"（或 --id=<行 id>）');
  process.exit(1);
}

/** 在源目录里按 base 名找图；优先无扩展名歧义的精确匹配 */
function findSourceImage(base) {
  for (const ext of IMAGE_EXTS) {
    const p = join(sourceDir, `${base}${ext}`);
    if (existsSync(p)) return p;
  }
  // 退一步：忽略大小写与尾随 UUID 再找一次（同 upload-daka.mjs 的 buildImageIndex 口径）
  const hit = readdirSync(sourceDir).find(
    (name) =>
      IMAGE_EXTS.includes(extname(name).toLowerCase()) &&
      basename(name, extname(name)).toLowerCase().startsWith(base.toLowerCase())
  );
  return hit ? join(sourceDir, hit) : null;
}

async function convertToWebP(imagePath) {
  const fileBuffer = readFileSync(imagePath);
  const buffer = await sharp(fileBuffer)
    .resize({ width: WEBP_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { buffer, origBytes: fileBuffer.length, webpBytes: buffer.length };
}

/**
 * 从库里的图片 URL 反推 COS 对象键。
 * 只认本桶的 https URL；带查询串的一律拒（说明不是裸对象地址）。
 */
function objectKeyFromUrl(url, bucket) {
  const prefix = `https://${bucket}.cos.`;
  if (!url?.startsWith(prefix)) return null;
  const slash = url.indexOf("/", prefix.length);
  if (slash < 0) return null;
  const objectKey = url.slice(slash + 1);
  return objectKey.includes("?") ? null : objectKey;
}

// 同一个 select 两处用：--id 直查行，否则按 --key 走本批次的分类规则定位 (character, title)
const ROW_COLUMNS =
  "json_build_object('id', id, 'character', character, 'title', title, 'images', images)";

let rows;
if (explicitId) {
  rows = await psqlJson(
    `select coalesce(json_agg(${ROW_COLUMNS}), '[]'::json)::text from mods where id = ${dollarQuote(explicitId)};`
  );
} else {
  const target = resolveDakaTarget(key);
  rows = await psqlJson(
    `select coalesce(json_agg(${ROW_COLUMNS}), '[]'::json)::text from mods
       where character = ${dollarQuote(target.character)} and title = ${dollarQuote(target.title)};`
  );
}

if (rows.length !== 1) {
  console.error(`❌ 期望命中 1 行，实际 ${rows.length} 行` + (key ? `（key=「${key}」）` : ""));
  if (rows.length > 1) for (const r of rows) console.error(`   ${r.id}  [${r.character}] ${r.title}`);
  process.exit(1);
}

const row = rows[0];
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS_BUCKET / COS_REGION（本地在 .env.local）");
  process.exit(1);
}

const currentUrl = (row.images ?? [])[0];
const objectKey = objectKeyFromUrl(currentUrl, cosBucket);
if (!objectKey) {
  console.error(`❌ 无法从库内 URL 反推对象键，这一行现在指向：${currentUrl ?? "(无图)"}`);
  console.error("   若这行原本是占位图，说明它从没传过图 —— 用上传脚本的补图路径，而不是这里。");
  process.exit(1);
}

const imagePath = explicitFile ? resolve(explicitFile) : key ? findSourceImage(key) : null;
if (!imagePath || !existsSync(imagePath)) {
  console.error(`❌ 找不到源图（目录 ${sourceDir}）`);
  process.exit(1);
}

console.log(`目标行: ${row.id}`);
console.log(`   [${row.character}] ${row.title}`);
console.log(`   现状: ${currentUrl}`);
console.log(`   对象键: ${objectKey}`);
console.log(`   源图: ${imagePath}  (${(readFileSync(imagePath).length / 1024).toFixed(0)}KB)`);

const { buffer, origBytes, webpBytes } = await convertToWebP(imagePath);
console.log(`   转换: ${(origBytes / 1024).toFixed(0)}KB → ${(webpBytes / 1024).toFixed(0)}KB webp`);

if (isDryRun) {
  console.log("\n🔍 DRY-RUN：未上传。去掉 --dry-run 执行。");
  process.exit(0);
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID?.trim(),
  SecretKey: process.env.COS_SECRET_KEY?.trim(),
});

await new Promise((resolvePromise, rejectPromise) => {
  cos.putObject(
    {
      Bucket: cosBucket,
      Region: cosRegion,
      Key: objectKey,
      Body: buffer,
      ContentType: "image/webp",
      // 覆盖写同一个键，必须让浏览器/图片优化器**别用缓存里的旧图**：
      // no-cache 是「每次用前先校验」，内容换了 ETag 就变 → 立刻拿到新图；
      // 不设的话浏览器会按启发式规则缓存旧图，用户会觉得「你根本没传上去」。
      CacheControl: "no-cache",
    },
    (err) => {
      if (err) rejectPromise(new Error(`COS 上传失败: ${err.message}`));
      else resolvePromise();
    }
  );
});

console.log(`\n✅ 已覆盖 ${objectKey}`);
console.log("   URL 没变，所以不用发快照、也不用 ping。");
