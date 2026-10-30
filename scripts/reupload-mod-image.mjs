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
 *
 * ## 为什么写完要改库 + 发快照 + ping（2026-10-30）
 *
 * 前台所有图都带数据万象的 `?imageMogr2/thumbnail/<w>x>/format/webp`，那个响应是
 * `Cache-Control: max-age=2592000`（30 天），而且**卡片用 800/1000、详情用 1280，
 * srcset 还有 640/960/1920 各自一条**。只覆盖对象、URL 不变 ⇒ 浏览器里那些派生 URL
 * 一条都不会失效，表现就是「卡片是新的、详情页还是旧的」—— 换个宽度就是另一条缓存。
 *
 * 所以覆盖后给 images[0] 拼上 `?v=<对象 ETag>`：URL 一变，所有宽度的派生 URL 全部
 * 换新，浏览器/CDN 自然重新拉。用 ETag 而不是时间戳：同一张图重传得到同一个 v，
 * 幂等，不会把每次重传都变成一次全站缓存失效。
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
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import { resolveDakaTarget } from "./daka-classify.mjs";
import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

/** 与 upload-daily-by-date.mjs 同一套转换参数（1000px webp q80；2026-10-22 由 750 提高，见该脚本 PREVIEW_WIDTH） */
const WEBP_WIDTH = 1000;
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
 * 只认本桶的 https URL。查询串要**剥掉**——本脚本自己会拼 `?v=<etag>`（见头注释），
 * 带着它去 putObject 会写到一个叫 `preview.webp?v=…` 的怪键上。
 */
function objectKeyFromUrl(url, bucket) {
  const prefix = `https://${bucket}.cos.`;
  if (!url?.startsWith(prefix)) return null;
  const slash = url.indexOf("/", prefix.length);
  if (slash < 0) return null;
  const objectKey = url.slice(slash + 1).split("?")[0];
  return objectKey || null;
}

/** 去掉查询串后的裸对象地址（用来拼新的 `?v=`）。 */
function bareUrl(url) {
  return String(url).split("?")[0];
}

// 同一个 select 两处用：--id 直查行，否则按 --key 走本批次的分类规则定位 (character, title)
const ROW_COLUMNS =
  "json_build_object('id', id, 'character', character, 'title', title, 'images', images, " +
  "'cover_width', cover_width, 'cover_height', cover_height)";

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

// 封面尺寸必须跟着换：瀑布流按 cover_width/cover_height 预留卡位（见 mods-infinite-grid
// 的 ratioFor），比例不对会留一大块空洞、或整张卡被挤成一格「网格」。
// 旧图 560x747 竖图换成 1000x533 横图却不改这两列，就是 2026-10-30 用户报的那个现象。
const meta = await sharp(buffer).metadata();
const coverWidth = meta.width ?? null;
const coverHeight = meta.height ?? null;
console.log(
  `   尺寸: ${coverWidth}x${coverHeight}` +
    (row.cover_width ? `（库内 ${row.cover_width}x${row.cover_height}）` : "（库内未记录）"),
);

if (isDryRun) {
  console.log("\n🔍 DRY-RUN：未上传。去掉 --dry-run 执行。");
  process.exit(0);
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID?.trim(),
  SecretKey: process.env.COS_SECRET_KEY?.trim(),
});

const etag = await new Promise((resolvePromise, rejectPromise) => {
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
      // ⚠️ 这条只管**裸对象**；带 imageMogr2 的派生图另有 30 天缓存，见头注释。
      CacheControl: "no-cache",
    },
    (err, data) => {
      if (err) rejectPromise(new Error(`COS 上传失败: ${err.message}`));
      else resolvePromise(String(data?.ETag ?? "").replace(/"/g, "").trim());
    }
  );
});

// 版本串优先用 COS 回的 ETag（内容指纹）：同一张图重传得到同一个 URL，幂等；
// 拿不到 ETag 时退回 webp 字节数，至少不会每次重传都换一个 URL。
const version = (etag || `s${webpBytes}`).slice(0, 16);
const newUrl = `${bareUrl(currentUrl)}?v=${version}`;

console.log(`\n✅ 已覆盖 ${objectKey}`);
console.log(`   图片 URL: ${currentUrl}`);
console.log(`         →  ${newUrl}`);

const urlChanged = newUrl !== currentUrl;
const dimsChanged = coverWidth !== row.cover_width || coverHeight !== row.cover_height;

if (!urlChanged && !dimsChanged) {
  console.log("   内容、版本、封面尺寸都没变，跳过改库/快照/ping。");
  process.exit(0);
}

// 改库：images[0]（URL 变了才换）+ 封面尺寸。其余图原样保留。
const nextImages = urlChanged ? [newUrl, ...(row.images ?? []).slice(1)] : row.images;
await psqlJson(`
with incoming as (
  select j.id, j.images, j.cover_width, j.cover_height, j.cover_source
  from jsonb_populate_recordset(null::mods, ${dollarQuote(
    JSON.stringify([
      {
        id: row.id,
        images: nextImages,
        cover_width: coverWidth,
        cover_height: coverHeight,
        // cover_source = 「尺寸是按哪张图量的」（见 scripts/cover-size.mjs）。
        // 不跟着写会让 syncCoverSizes 把这一行当成待测量，白白再下载一次。
        cover_source: nextImages?.[0] ?? null,
      },
    ]),
  )}::jsonb) j
),
upd as (
  update mods
  set images = incoming.images,
      cover_width = incoming.cover_width,
      cover_height = incoming.cover_height,
      cover_source = incoming.cover_source,
      updated_at = now()
  from incoming
  where mods.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`);
console.log(`   🗄  已更新库内 ${urlChanged ? "images[0]、" : ""}cover ${coverWidth}x${coverHeight}`);

// 图片 URL 或封面比例变了 ⇒ 首页/列表/详情/快照都要换，否则前台一半新一半旧
await publishSnapshotBestEffort();
await notifyRevalidate({
  siteUrl: process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz",
  secret: process.env.REVALIDATE_SECRET?.trim(),
});

// 香港反代同样缓存了带旧 URL 的列表 JSON，不清理的话最长一个 TTL 都发不出来
const purge = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/purge-hk-api-cache.mjs"), "--all"], {
  encoding: "utf8",
  timeout: 180_000,
});
console.log(purge.status === 0 ? purge.stdout.trim() : `⚠️  清香港反代缓存失败：${(purge.stderr || purge.stdout || "").trim()}`);

/** 导出兜底快照并发到 COS。失败只告警：库已经对了，最坏是锁定期前台读旧快照。 */
async function publishSnapshotBestEffort() {
  try {
    await publishSnapshotToCos({
      cos,
      bucket: cosBucket,
      region: cosRegion,
      databaseUrl: process.env.DATABASE_URL?.trim(),
      sqlPath: resolve(process.cwd(), "scripts/mods-snapshot.sql"),
      outPath: resolve(process.cwd(), SNAPSHOT_REL_PATH),
      rawPath: join(tmpdir(), "wavemod-snapshot-raw.json"),
    });
  } catch (err) {
    console.warn(`⚠️  兜底快照发布失败: ${err.message}`);
    console.warn("   库内数据已就绪；但若 Supabase 网关被锁，前台仍会显示旧快照内容。");
  }
}
