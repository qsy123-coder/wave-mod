/**
 * 补图：把「补图/<角色>/*.png」补到对应 mod 的**占位图**上。
 *
 * 为什么需要单独一条路径：入库那一刻的图只在**入库那一刻**看过一眼 —— 源目录里当时
 * 没有预览图的 mod 会被写成占位图（PLACEHOLDER_IMAGE_URL），之后再补源图也不会自动
 * 生效，因为每日脚本的去重键 `character|title` 已经存在，整条记录直接被跳过。
 *
 * 与 reupload-mod-image.mjs 的分工（两者不可互相替代）：
 *   - reupload 是**覆盖已有对象键**：URL 不变，所以不用发快照、不用 ping；
 *   - 本脚本是**从占位图换成新对象键**：URL 变了，前台读的是快照里的 images，
 *     不发快照 + ping 的话，库里改了、线上还是占位图。
 *
 * 匹配规则：文件名（去 .png）剥掉子目录里的角色前缀 → 就是库内 title。
 * 源图名与导入后的 title 未必一致（导入时标题被规范化过），对不上的写在下面的
 * TITLE_OVERRIDES 里，一条一条注明来由。
 *
 * 用法:
 *   node scripts/fill-placeholder-images.mjs --dry-run   # 只匹配，不上传
 *   node scripts/fill-placeholder-images.mjs             # 正式上传 + 更新 images[1]
 *
 * 幂等：只改**当前仍是占位图**的行，已有真图的行默认拒绝（--force 才覆盖）。
 * 重复跑一遍不会把图改坏，最坏是白传一遍 COS（同一个键，内容相同）。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const GAME_KEY = "wuthering-waves";
/** 与 upload-daily-by-date.mjs 完全同一套转换参数，保证补的图和批量入库的图看起来一致 */
const WEBP_WIDTH = 750;
const WEBP_QUALITY = 80;

const SOURCE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\补图`;
/** 占位图 URL：与 upload-daily-by-date.mjs 的 PLACEHOLDER_IMAGE_URL 同值 */
const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://www.wave-mod.top";

/**
 * 源图名 ≠ 库内 title 的特例。
 *
 * 两条都出在同一个场景：同一个 mod 在库里存在**两条**记录（不同日期的重复导入 /
 * 不同版本），源图名只对得上其中一条的 title，而缺图的是另一条。
 *
 *   - 「菲比-连衣裙」：库里有「连衣裙」（入库时已有图）和
 *     「连衣裙2.0（上下左右 alt+左右 ？切换）」（占位），源目录只有一张图
 *     → 给占位那条。
 *   - 「菲比手杖－玛格丽特武器」：库里有「手杖－玛格丽特武器」（全角－，已有图）和
 *     「手杖-玛格烈特武器」（半角-，占位），是同一把菲比手杖
 *     → 给占位那条。
 *
 * 两条都是 2026-09-22 用户逐条确认的。
 */
const TITLE_OVERRIDES = new Map([
  ["菲比/菲比-连衣裙", "连衣裙2.0（上下左右 alt+左右 ？切换）"],
  ["菲比/菲比手杖－玛格丽特武器", "手杖-玛格烈特武器"],
]);

/** 明确不补的图，以及为什么 */
const SKIP = new Map([
  // 同名行「怨仇 by 米单单 （5切换）」已有同一张图（只差线上那张带水印）；
  // 附近那条占位行是「怨仇v2.7（p切换）」，看着是另一个版本 —— 补不补等用户确认，别猜。
  ["菲比/菲比-怨仇 by 米单单 （5切换）", "同名行已有同一张图；隔壁占位行是 v2.7，未确认"],
]);

const isDryRun = process.argv.includes("--dry-run");
const isForce = process.argv.includes("--force");

const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!cosSecretId || !cosSecretKey || !cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION（本地在 .env.local）");
  process.exit(1);
}
const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey });

function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      { Bucket: cosBucket, Region: cosRegion, Key: objectKey, Body: body, ContentType: contentType },
      (err, data) => (err ? rejectPromise(new Error(`COS 上传失败: ${err.message}`)) : resolvePromise(data))
    );
  });
}

/** 与 upload-daily-by-date.mjs 的 slugify 同实现：对象键里角色那一段必须一致 */
function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "mod"
  );
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
 * 源图名 → 库内 title：剥掉子目录名（角色）前缀，再剥掉紧随其后的连接符。
 *   「奥古斯塔-曲启明-龙雀归膺」 → title「曲启明-龙雀归膺」
 *   「奥古斯塔的大剑-七实专武」   → title「的大剑-七实专武」（大剑那批的 title 本来就带「的」）
 *   「达妮娅特效更改（F7切换）」  → title「特效更改（F7切换）」（源图名没有连接符）
 */
function resolveTitle(character, base) {
  const rest = base.startsWith(character) ? base.slice(character.length) : base;
  return rest.replace(/^[\s\-－—_]+/, "").trim();
}

// ==================== 1. 列出补图 ====================

if (!existsSync(SOURCE_DIR)) {
  console.error(`❌ 找不到补图目录：${SOURCE_DIR}`);
  process.exit(1);
}

const characters = readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const files = [];
for (const character of characters) {
  for (const name of readdirSync(join(SOURCE_DIR, character))) {
    if (extname(name).toLowerCase() !== ".png") continue;
    const base = basename(name, extname(name));
    files.push({ character, base, key: `${character}/${base}`, path: join(SOURCE_DIR, character, name) });
  }
}
console.log(`补图目录：${characters.length} 个角色，${files.length} 张 png\n`);

// ==================== 2. 一次拉全相关行（链路慢，别 40 次往返） ====================

const rows = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id::text, 'character', character, 'title', title, 'images', images
) order by character, title), '[]'::json)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)}
  and character in (${characters.map((c) => dollarQuote(c)).join(", ")});
`);

const isPlaceholder = (url) => !url || url === PLACEHOLDER_IMAGE_URL || url.includes("placeholder");

// ==================== 3. 逐张匹配 ====================

const matched = [];
const rejected = [];
const already = [];

for (const file of files) {
  const skipReason = SKIP.get(file.key);
  if (skipReason) {
    rejected.push({ file, reason: `跳过：${skipReason}` });
    continue;
  }

  const title = TITLE_OVERRIDES.get(file.key) ?? resolveTitle(file.character, file.base);
  const hits = rows.filter((r) => r.character === file.character && r.title === title);

  if (hits.length === 0) {
    rejected.push({ file, reason: `库内找不到 character=「${file.character}」title=「${title}」的行` });
    continue;
  }
  if (hits.length > 1) {
    rejected.push({ file, reason: `title=「${title}」命中 ${hits.length} 行，无法确定改哪条` });
    continue;
  }

  const row = hits[0];
  // 对象键从**行 id** 拼，与 upload-daily-by-date.mjs 同构 —— 前台读的就是这个键。
  // 先算出来，是因为幂等判定要用它比对（见下）。
  const objectKey = `mods/${slugify(row.character)}/${row.id}/preview.webp`;
  const url = buildCosUrl(objectKey);
  const current = (row.images ?? [])[0] ?? null;

  // 幂等的那一半：这条已经是**本脚本会写到的那张图** ⇒ 上次跑过了，静默跳过。
  // 不单独分出来的话，重跑一次会把已补好的几十行全报成「已有真图」，
  // 真正的异常（图被换过、对不上的行）就淹在噪声里看不见了。
  if (current === url) {
    already.push({ file, row, title });
    continue;
  }

  if (!isPlaceholder(current)) {
    rejected.push({
      file,
      reason: isForce
        ? `--force 覆盖：该行原图 ${current}`
        : `该行已有真图（不是占位图），未改。要覆盖加 --force。现图 ${current}`,
    });
    if (!isForce) continue;
  }

  matched.push({ file, row, title, objectKey, url });
}

// ==================== 4. 报告 ====================

console.log(`=== 待补图 ${matched.length} 张 ===`);
let lastChar = null;
for (const { file, row, title } of matched) {
  if (file.character !== lastChar) {
    console.log(`\n[${file.character}]`);
    lastChar = file.character;
  }
  console.log(`  ${file.base}.png`);
  console.log(`    → id=${row.id} title=「${title}」`);
}

if (already.length) {
  console.log(`\n=== 已补过、本次跳过 ${already.length} 张 ===`);
  // 全量重跑时这一串可能几十条，长到没法看；只有当它本身就少的时候才逐条列出来
  if (already.length <= 8) console.log(`  ${already.map((a) => a.file.base).join("、")}`);
}

if (rejected.length) {
  console.log(`\n=== 未处理 ${rejected.length} 张 ===`);
  for (const { file, reason } of rejected) {
    console.log(`  ⏭️  ${file.key}.png`);
    console.log(`      ${reason}`);
  }
}

if (isDryRun) {
  console.log(`\n🔍 DRY-RUN：未上传、未改库。去掉 --dry-run 执行。`);
  process.exit(0);
}

if (matched.length === 0) {
  console.log("\n没有需要补的图，退出。");
  process.exit(0);
}

// ==================== 5. 上传 COS ====================

console.log(`\n=== 上传 COS（${matched.length} 张） ===`);
const updates = [];
let failed = 0;

for (const { file, row, title, objectKey, url } of matched) {
  try {
    const { buffer, origBytes, webpBytes } = await convertToWebP(file.path);
    await uploadToCos(objectKey, buffer, "image/webp");
    updates.push({ id: row.id, url });
    console.log(
      `  ✅ [${row.character}] ${title}  ${(origBytes / 1024).toFixed(0)}KB → ${(webpBytes / 1024).toFixed(0)}KB`
    );
  } catch (err) {
    failed++;
    console.error(`  ❌ [${row.character}] ${title}: ${err.message}`);
  }
}

if (updates.length === 0) {
  console.error("\n❌ 一张都没传上去，未改库。");
  process.exit(1);
}

// ==================== 6. 改库（一条语句，原子） ====================

// WHERE 里再挡一道「仍是占位图」：本地匹配到写库之间隔了几分钟，这期间若别的流程
// 已经补过图，这里就不该再覆盖它 —— 守卫放在 SQL 里才是真的守住了。
const values = updates.map((u) => `(${dollarQuote(u.id)}::uuid, ${dollarQuote(u.url)})`).join(",\n  ");
const updated = await psqlJson(`
with v(id, url) as (values
  ${values}
),
upd as (
  update mods m
     set images = array[v.url] || coalesce(m.images[2:cardinality(m.images)], '{}'::text[])
    from v
   where m.id = v.id
     and (m.images[1] is null or m.images[1] like '%placeholder%')
  returning m.id, m.images[1] as url
)
select coalesce(json_agg(json_build_object('id', id, 'url', url)), '[]'::json)::text from upd;
`);

console.log(`\n📊 上传 ${updates.length} 张（失败 ${failed}），库内更新 ${updated.length} 行`);
if (updated.length !== updates.length) {
  console.error("⚠️  更新行数与上传数不一致：可能有行已被别的流程改过（守卫拦下）。");
  console.error("   重跑一次 --dry-run 看留下的占位行。");
}

// ==================== 7. 发快照 + ping ====================

// 顺序不能反（先发 COS 快照、再 ping），理由见 mods-snapshot-export.mjs 的 notifyRevalidate。
// 只在**确实有行被改**时才发：没改库时快照内容没变，白敲一次没意义。
if (updated.length > 0) {
  try {
    await publishSnapshotToCos({
      cos,
      bucket: cosBucket,
      region: cosRegion,
      databaseUrl: process.env.DATABASE_URL?.trim(),
      sqlPath: resolve(process.cwd(), "scripts/mods-snapshot.sql"),
      outPath: resolve(process.cwd(), SNAPSHOT_REL_PATH),
      rawPath: join(tmpdir(), "wavemod-fill-images-snapshot-raw.json"),
    });
  } catch (err) {
    console.warn(`⚠️  兜底快照发布失败: ${err.message}`);
    console.warn("   库内数据已就绪；但若 Supabase 网关被锁，前台仍会显示旧的占位图。");
  }
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
}

console.log("\n完成。");
