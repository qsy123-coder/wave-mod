/**
 * 把本地处理好的图**覆盖回 COS 上的同一个对象键**，全程不查数据库。
 *
 * 与 reupload-mod-image.mjs 的分工：
 *   - 那个脚本从库里的 images[0] 反推对象键 → 库挂了就跑不动；
 *   - 本脚本直接吃**前台那张图的 URL**（页面生成的命令里就带着），只做 URL → key 的纯字符串推导，
 *     因此断库可用。
 *
 * 沿用 reupload-mod-image.mjs 的两条结论（见该文件 :9-13 与 :170-173）：
 *   1. URL 没变 → 不用改库、不用发快照、不用 ping /api/revalidate；
 *   2. 覆盖同键必须写 `Cache-Control: no-cache`，否则浏览器按启发式规则继续用旧图。
 *
 * 用法（页面 public/tools/blur.html 底部会直接生成第一条命令）：
 *   node scripts/overwrite-cos-image.mjs --url-file="blur-url.txt" --latest --dry-run
 *   node scripts/overwrite-cos-image.mjs --url-file="blur-url.txt" --latest
 *   node scripts/overwrite-cos-image.mjs --url="https://…/mods/ui/xxx/preview.webp" --file="C:\…\xxx-blur.webp"
 *
 * 参数：
 *   --url=<URL>        原图（线上那张）的地址，必须是无查询串的 COS 裸对象地址
 *   --url-file=<路径>  从 UTF-8 文本文件读 URL（首行）。**URL 含中文时必须用这个**：
 *                      PowerShell 5.1 会把命令行里的中文按 ANSI 代码页改写（见 powershell-ansi-encoding-traps）
 *   --file=<路径>      要上传的图；不给则用 --latest 自动挑
 *   --latest[=<关键词>] 在下载目录里挑最新的 *-blur.webp（可按文件名关键词进一步收窄）
 *   --width=<n>        上传前缩到多宽（默认 1000，与每日脚本的 PREVIEW_WIDTH 一致；不放大）
 *   --keep-size        不缩放，按原分辨率上传
 *   --dry-run          只打印将要对哪个对象键做什么，不发任何写请求
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import {
  contentTypeForFormat,
  encodeFormatForKey,
  isAsciiOnly,
  isImageObjectKey,
  parseCosObjectKey,
} from "./cos-object-key.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const DEFAULT_WIDTH = 1000;
const UPLOAD_EXTS = [".webp", ".png", ".jpg", ".jpeg"];

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

/** --latest 可以只写开关，也可以带关键词 */
function readLatestArg() {
  const bare = process.argv.slice(2).includes("--latest");
  const withValue = readArg("--latest");
  if (withValue !== undefined) return { enabled: true, keyword: withValue.trim() };
  return { enabled: bare, keyword: "" };
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(0)}KB`;
}

/** 从文本文件读 URL：容忍 BOM（记事本另存为 UTF-8 会带）与行尾空白 */
function readUrlFile(filePath) {
  const text = readFileSync(resolve(filePath), "utf8").replace(/^﻿/, "");
  const line = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (!line) fail(`URL 文件是空的：${filePath}`);
  return line;
}

/** 在下载目录里挑最新的打码图 */
function findLatestDownloaded(keyword) {
  const downloads = join(homedir(), "Downloads");
  if (!existsSync(downloads)) fail(`找不到下载目录：${downloads}，请改用 --file=<路径>`);

  const candidates = readdirSync(downloads)
    .filter((name) => UPLOAD_EXTS.includes(extname(name).toLowerCase()))
    .filter((name) => /-blur\b/i.test(name) || /blur/i.test(name))
    .filter((name) => (keyword ? name.includes(keyword) : true))
    .map((name) => {
      const full = join(downloads, name);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (candidates.length === 0) {
    fail(`下载目录里没有找到 *-blur 图片（${downloads}），请改用 --file=<路径>`);
  }

  const newest = candidates[0];
  const ageMinutes = (Date.now() - newest.mtime) / 60000;
  if (ageMinutes > 120) {
    fail(
      `下载目录里最新的打码图是 ${Math.round(ageMinutes)} 分钟前的：${newest.full}\n` +
        "   为了不误传旧文件，请用 --file=<路径> 明确指定。"
    );
  }
  if (candidates.length > 1 && Date.now() - candidates[1].mtime < 60_000) {
    console.warn("⚠️ 下载目录里有多张最近一分钟内的打码图，将使用最新的那张：");
    for (const c of candidates.slice(0, 3)) console.warn(`   ${basename(c.full)}`);
  }
  return newest.full;
}

async function convert(inputPath, key, options) {
  const inputBuffer = readFileSync(inputPath);
  const format = encodeFormatForKey(key);

  let pipeline = sharp(inputBuffer);
  if (!options.keepSize) {
    pipeline = pipeline.resize({ width: options.width, withoutEnlargement: true });
  }
  if (format === "png") pipeline = pipeline.png({ compressionLevel: 9 });
  else if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
  else pipeline = pipeline.webp({ quality: 92 });

  const buffer = await pipeline.toBuffer();
  return { buffer, format, contentType: contentTypeForFormat(format), inputBytes: inputBuffer.length };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const keepSize = hasFlag("--keep-size");
  const widthArg = Number(readArg("--width") ?? DEFAULT_WIDTH);
  if (!Number.isFinite(widthArg) || widthArg <= 0) fail("--width 需要是正整数");

  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  if (!bucket || !region) fail("缺少 COS_BUCKET / COS_REGION（本地在 .env.local）");

  // ---- 1. 拿 URL ----
  const urlFile = readArg("--url-file")?.trim();
  const inlineUrl = readArg("--url")?.trim();
  if (urlFile && inlineUrl) fail("--url 与 --url-file 只能给一个");
  if (!urlFile && !inlineUrl) fail("需要 --url=<原图URL> 或 --url-file=<文本文件>");

  if (inlineUrl && !isAsciiOnly(inlineUrl)) {
    fail(
      "URL 里含非 ASCII 字符，经命令行传递可能被破坏。\n" +
        "   请把 URL 存成 UTF-8 文本文件后改用：--url-file=<文件>"
    );
  }

  const url = urlFile ? readUrlFile(urlFile) : inlineUrl;
  const objectKey = parseCosObjectKey(url, bucket);
  if (!objectKey) {
    fail(
      `无法从该地址反推对象键：${url}\n` +
        `   只接受 https://${bucket}.cos.<region>.myqcloud.com/<key> 形态、且不带 ? 查询串。\n` +
        "   带 ?imageMogr2/... 的是渲染层拼出来的缩略图地址，不是对象本身。"
    );
  }
  if (!isImageObjectKey(objectKey)) {
    fail(`对象键不是图片扩展名：${objectKey}（拒绝覆盖非图片对象）`);
  }

  // ---- 2. 拿文件 ----
  const latest = readLatestArg();
  const explicitFile = readArg("--file")?.trim();
  if (explicitFile && latest.enabled) fail("--file 与 --latest 只能给一个");
  if (!explicitFile && !latest.enabled) fail("需要 --file=<路径> 或 --latest");

  const inputPath = explicitFile ? resolve(explicitFile) : findLatestDownloaded(latest.keyword);
  if (!existsSync(inputPath)) fail(`找不到文件：${inputPath}`);

  // ---- 3. 转换 ----
  const { buffer, format, contentType, inputBytes } = await convert(inputPath, objectKey, {
    width: widthArg,
    keepSize,
  });

  console.log(`对象键 : ${objectKey}`);
  console.log(`        原地址 ${url}`);
  console.log(`源文件 : ${inputPath}  (${formatBytes(inputBytes)})`);
  console.log(
    `上传   : ${formatBytes(buffer.length)} ${format}` +
      (keepSize ? "（原分辨率）" : `（宽 ≤ ${widthArg}px，不放大）`)
  );
  console.log("缓存头 : Cache-Control: no-cache（覆盖后立刻可见）");

  if (dryRun) {
    console.log("\n🔍 DRY-RUN：未上传。确认对象键无误后去掉 --dry-run 执行。");
    return;
  }

  // ---- 4. 覆盖 ----
  const cos = new COS({
    SecretId: process.env.COS_SECRET_ID?.trim(),
    SecretKey: process.env.COS_SECRET_KEY?.trim(),
  });

  await new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "no-cache",
      },
      (err) => {
        if (err) rejectPromise(new Error(`COS 上传失败: ${err.message}`));
        else resolvePromise();
      }
    );
  });

  console.log(`\n✅ 已覆盖 ${objectKey}`);
  console.log("   URL 没变，所以不用改库、不用发快照、也不用 ping。");
  console.log("   验收：无痕窗口打开前台该 mod 详情，确认图片已换。");
  console.log("   ⚠️ 卡片缩略图走 ?imageMogr2/... 的响应可能仍被 CDN 缓存，最多等 7 天或换新键。");
}

await main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
