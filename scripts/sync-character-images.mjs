/**
 * 把一个「补图/<角色>」目录里的预览图同步到站上该角色的 mod 行：
 *   · 该行**已有真图** → 覆盖 COS 上那张图的对象键（URL 不变）
 *   · 该行**还是占位图 / 没有图** → 传新对象键 + 改库 images[0]
 *   · 库内没有对应行 → 不动，列出来
 *
 * 与另外两个脚本的分工（三个都以「源图怎么落到 COS」区分，不可互相替代）：
 *   - reupload-mod-image.mjs      单张、同键覆盖，**不改库**。要一行一行点名。
 *   - fill-placeholder-images.mjs 扫 补图/*，但**只碰占位行**，已有真图一律拒绝
 *     （那是它的安全属性，不能拿掉）。
 *   - 本脚本                       按角色批量，**占位行和已有真图都处理** ——
 *     用户 2026-09-27 对 补图/今汐 的要求就是「站上有图就替换，没有就用这张」。
 *
 * 为什么「覆盖已有真图」必须是同键覆盖（不改 URL）：
 * 前台读的是快照/库里的 images[0]，换个键就得改库 + 重发快照 + ping，还会把旧键
 * 变成孤儿对象。同键覆盖只要那个对象带 `Cache-Control: no-cache` 就立即生效
 * （每次复用先回源校验，ETag 一变就拿到新图）。本脚本上传时统一写 no-cache，
 * 覆盖前也会**核对现存对象是不是 no-cache**，不是就跳过并点名 —— 那种对象覆盖了
 * 浏览器还会按启发式缓存旧图好几天，等于白干（2026-09-27 轮播下架事故的成因）。
 *
 * 幂等：重跑一遍最坏是白传一遍 COS（同键同内容），不会把图改坏。
 *
 * 用法:
 *   node scripts/sync-character-images.mjs --dry-run     # 只匹配 + 报账，不上传
 *   node scripts/sync-character-images.mjs               # 正式上传（默认 补图/今汐）
 *   node scripts/sync-character-images.mjs --dir="D:\...\补图\菲比" --character=菲比
 *
 * ⚠️ 路径/角色名带中文，**别在命令行里传中文**：PowerShell 5.1 会把非 ASCII 参数按
 * GBK 转发给原生 exe，Node 收到的是乱码。所以默认值写死在脚本里，要换目录就改
 * DEFAULT_DIR / DEFAULT_CHARACTER。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import { buildTitleIndex, matchRow } from "./character-image-match.mjs";
import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const GAME_KEY = "wuthering-waves";

/**
 * 转换参数与 2026-09-27 全站统一的那一档一致（`mods/` 下 5222 个 webp 都是
 * 560 宽 q78）。别改回 750/q80 —— 那会让本批图和站上其余图清晰度/体积不一致。
 * withoutEnlargement：源图普遍只有 440~540 宽，放大只会变糊还更费流量。
 */
const WEBP_WIDTH = 560;
const WEBP_QUALITY = 78;

const DEFAULT_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\补图\今汐`;
const DEFAULT_CHARACTER = "今汐";

/** 占位图 URL：与 upload-daily-by-date.mjs / fill-placeholder-images.mjs 同值 */
const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://www.wave-mod.top";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const isDryRun = process.argv.includes("--dry-run");
const sourceDir = readArg("--dir")?.trim() || DEFAULT_DIR;
const character = readArg("--character")?.trim() || DEFAULT_CHARACTER;

if (!existsSync(sourceDir)) {
  console.error(`❌ 找不到补图目录：${sourceDir}`);
  process.exit(1);
}

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
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        // no-cache 不只是给这次的浏览器用：它让**下一次**覆盖同一键时也能立刻生效。
        // 不写的话这个对象就永远只能靠换键来更新（见文件头）。
        CacheControl: "no-cache",
      },
      (err, data) => (err ? rejectPromise(new Error(`COS 上传失败: ${err.message}`)) : resolvePromise(data))
    );
  });
}

function headObject(objectKey) {
  return new Promise((resolvePromise) =>
    cos.headObject({ Bucket: cosBucket, Region: cosRegion, Key: objectKey }, (err, data) =>
      resolvePromise(err ? { err: err.message } : { headers: data.headers ?? {}, lastModified: data.LastModified })
    )
  );
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

/** 与 upload-daily-by-date.mjs / fill-placeholder-images.mjs 同一套转换 */
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
 *
 * 必须**反推**而不是按 id 重拼：只有这样才能保证覆盖的正是前台在读的那张图。
 * 键里含 slugify(character) 与行 id 两段易变逻辑，重算一份就是第二处真源。
 * 只认本桶的裸对象地址，带查询串 / 别的域（Supabase 托管的那种）一律拒。
 */
function objectKeyFromUrl(url, bucket) {
  const prefix = `https://${bucket}.cos.`;
  if (!url?.startsWith(prefix)) return null;
  const slash = url.indexOf("/", prefix.length);
  if (slash < 0) return null;
  const objectKey = url.slice(slash + 1);
  return objectKey.includes("?") ? null : objectKey;
}

const isPlaceholder = (url) => !url || url === PLACEHOLDER_IMAGE_URL || url.includes("placeholder");

// ==================== 1. 源目录里的图 ====================

const sourceFiles = readdirSync(sourceDir, { withFileTypes: true })
  .filter((e) => e.isFile() && IMAGE_EXTS.includes(extname(e.name).toLowerCase()))
  .map((e) => ({
    file: e.name,
    base: basename(e.name, extname(e.name)),
    path: join(sourceDir, e.name),
  }))
  .sort((a, b) => a.base.localeCompare(b.base, "zh"));

console.log(`补图目录：${sourceDir}`);
console.log(`角色：${character} | 源图 ${sourceFiles.length} 张\n`);

// ==================== 2. 拉该角色的全部行（一次查询，链路慢别来回跑） ====================

const rows = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id::text, 'character', character, 'title', title,
  'image', coalesce(images[1], ''), 'created', to_char(created_at, 'YYYY-MM-DD')
) order by title), '[]'::json)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)}
  and character = ${dollarQuote(character)};
`);

if (!Array.isArray(rows)) {
  console.error(`❌ 查询失败：库内没有 character=「${character}」的行`);
  process.exit(1);
}
const withImage = rows.filter((r) => !isPlaceholder(r.image)).length;
console.log(`库内「${character}」共 ${rows.length} 行（已有真图 ${withImage} / 占位 ${rows.length - withImage}）\n`);

const titleIndex = buildTitleIndex(rows);

// ==================== 3. 逐张匹配 ====================

/** 新增：占位行 → 新对象键 + 改库 */
const additions = [];
/** 覆盖：已有真图 → 覆盖那个对象键，URL 不变 */
const replacements = [];
const unmatched = [];
const ambiguous = [];
const foreign = [];
const claimedRowIds = new Map(); // 行 id → 已认领它的源图，防两张图抢同一行

for (const src of sourceFiles) {
  const matched = matchRow(titleIndex, character, src.base);
  if (matched.status === "none") {
    unmatched.push(src);
    continue;
  }
  if (matched.status === "ambiguous") {
    ambiguous.push({ src, hits: matched.hits });
    continue;
  }

  const row = matched.row;
  const owner = claimedRowIds.get(row.id);
  if (owner) {
    // 两张源图指向同一行：只认第一张，第二张点名。多发生在重名后缀与原名同时存在时。
    ambiguous.push({ src, hits: [{ title: owner, row }] });
    continue;
  }

  if (isPlaceholder(row.image)) {
    claimedRowIds.set(row.id, src.base);
    additions.push({
      src,
      row,
      // 与 upload-daily-by-date.mjs 同构：键由行 id 拼，前台读的就是它
      objectKey: `mods/${slugify(character)}/${row.id}/preview.webp`,
    });
    continue;
  }

  const objectKey = objectKeyFromUrl(row.image, cosBucket);
  if (!objectKey) {
    foreign.push({ src, row });
    continue;
  }
  claimedRowIds.set(row.id, src.base);
  replacements.push({ src, row, objectKey });
}

// ==================== 4. 报账 ====================

function printList(title, list, render) {
  if (list.length === 0) return;
  console.log(`\n=== ${title}（${list.length}）===`);
  for (const item of list) console.log(render(item));
}

console.log(`=== 待处理 ${additions.length + replacements.length} 张 ===`);
console.log(`   新增（占位 → 新键，要改库 + 发快照 + ping）  ${additions.length}`);
console.log(`   替换（已有真图 → 同键覆盖，URL 不变）        ${replacements.length}`);

printList("新增（占位行补图）", additions, ({ src, row }) => `  ${src.base}.png\n    → [${row.created}] ${row.title}`);
printList("替换（覆盖线上同一对象键）", replacements, ({ src, row, objectKey }) => `  ${src.base}.png\n    → ${row.title}\n       key=${objectKey}`);

if (ambiguous.length) {
  console.log(`\n=== 命中不唯一 / 两张图抢同一行，跳过（${ambiguous.length}）===`);
  for (const { src, hits } of ambiguous) {
    console.log(`  ⏭️  ${src.base}.png`);
    for (const h of hits) console.log(`       → 行 ${h.row.id}「${h.title}」`);
  }
}

printList("库内找不到对应行，跳过", unmatched, (src) => `  ⏭️  ${src.base}.png`);

printList(
  "行内图片不在本桶（如 Supabase 托管），无法同键覆盖，跳过",
  foreign,
  ({ src, row }) => `  ⏭️  ${src.base}.png\n       ${row.title} 现图 ${row.image}`
);

// 反向：库内有、源目录没有的占位行 —— 本次帮不上，但仍值得点名（说明补图没补齐）
const matchedIds = new Set([...additions, ...replacements].map((m) => m.row.id));
const stillPlaceholder = rows.filter((r) => isPlaceholder(r.image) && !matchedIds.has(r.id));
if (stillPlaceholder.length) {
  console.log(`\n=== 库内仍是占位图、但没有对应源图（${stillPlaceholder.length}）===`);
  for (const r of stillPlaceholder.slice(0, 40)) console.log(`  · ${r.title}`);
  if (stillPlaceholder.length > 40) console.log(`  … 其余 ${stillPlaceholder.length - 40} 条省略`);
}

// ==================== 5. 覆盖前先核对:现存对象必须带 no-cache ====================

// 带 no-cache 的对象覆盖后立即生效；没有的会被浏览器按启发式缓存好几天 ——
// 那种情况下「传上去了但客户端还是旧图」，所以宁可跳过并点名，别假装成功。
//
// 这一步放在 dry-run 退出**之前**：它决定 30 张里实际有几张能覆盖，属于「跑之前
// 就该知道」的信息。放在后面的话 dry-run 报 30、真跑只覆盖 28，差在哪要翻日志。
const blocked = [];
const ready = [];
for (const item of replacements) {
  const head = await headObject(item.objectKey);
  if (head.err) {
    blocked.push({ ...item, reason: `headObject 失败：${head.err}` });
    continue;
  }
  const cc = head.headers["cache-control"] ?? "";
  if (!cc.includes("no-cache") && !cc.includes("no-store") && !cc.includes("max-age=0")) {
    blocked.push({ ...item, reason: `现存对象没有 no-cache（Cache-Control="${cc || "(无)"}"）` });
    continue;
  }
  ready.push(item);
}

console.log(`\n=== 覆盖可行性核对（挨个 head 现存对象）===`);
console.log(`   带 no-cache、覆盖后立即生效  ${ready.length}`);
console.log(`   不带 no-cache、覆盖了也看不到新图  ${blocked.length}`);

if (blocked.length) {
  console.log(`\n=== 跳过覆盖：现存对象不带 no-cache（${blocked.length}）===`);
  for (const b of blocked) console.log(`  ⏭️  ${b.src.base}.png  ${b.reason}\n       key=${b.objectKey}`);
  console.log("   这类对象同键覆盖后客户端仍会拿旧图，需要换键（改库 + 发快照）——先问用户。");
}

if (isDryRun) {
  console.log(`\n🔍 DRY-RUN：未上传、未改库。去掉 --dry-run 执行。`);
  process.exit(0);
}

if (additions.length + ready.length === 0) {
  console.log("\n没有需要处理的图，退出。");
  process.exit(0);
}

// ==================== 6. 上传 ====================

console.log(`\n=== 上传 COS（新增 ${additions.length} + 覆盖 ${ready.length}）===`);
const dbUpdates = [];
let failed = 0;

for (const { src, row, objectKey } of additions) {
  try {
    const { buffer, origBytes, webpBytes } = await convertToWebP(src.path);
    await uploadToCos(objectKey, buffer, "image/webp");
    dbUpdates.push({ id: row.id, url: buildCosUrl(objectKey) });
    console.log(
      `  ✅ 新增 [${row.title}]  ${(origBytes / 1024).toFixed(0)}KB → ${(webpBytes / 1024).toFixed(0)}KB`
    );
  } catch (err) {
    failed++;
    console.error(`  ❌ 新增 [${row.title}]: ${err.message}`);
  }
}

for (const { src, row, objectKey } of ready) {
  try {
    const { buffer, origBytes, webpBytes } = await convertToWebP(src.path);
    await uploadToCos(objectKey, buffer, "image/webp");
    console.log(
      `  ✅ 覆盖 [${row.title}]  ${(origBytes / 1024).toFixed(0)}KB → ${(webpBytes / 1024).toFixed(0)}KB`
    );
  } catch (err) {
    failed++;
    console.error(`  ❌ 覆盖 [${row.title}]: ${err.message}`);
  }
}

// ==================== 7. 改库（只改「仍是占位图」的行，一条语句原子） ====================

let updated = [];
if (dbUpdates.length > 0) {
  // WHERE 里再挡一道「仍是占位图」：本地匹配到写库之间隔了几分钟，这期间若别的流程
  // 已经补过图，这里就不该再覆盖它 —— 守卫放在 SQL 里才是真的守住了。
  const values = dbUpdates.map((u) => `(${dollarQuote(u.id)}::uuid, ${dollarQuote(u.url)})`).join(",\n  ");
  updated = await psqlJson(`
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
  console.log(`\n📊 上传 ${additions.length + ready.length} 张（失败 ${failed}），库内更新 ${updated.length} 行`);
  if (updated.length !== dbUpdates.length) {
    console.error("⚠️  更新行数与预期不一致：可能有行已被别的流程改过（守卫拦下）。");
    console.error("   重跑一次 --dry-run 看留下的占位行。");
  }
} else {
  console.log(`\n📊 上传 ${additions.length + ready.length} 张（失败 ${failed}）；无占位行需要改库。`);
}

// ==================== 8. 发快照 + ping ====================

// 只有**改过库**才需要：改库会换 images[0] 的 URL，前台读的是快照里的值。
// 纯覆盖那部分 URL 没变，前台不需要任何通知（no-cache 让它自己拿到新图）。
// 顺序不能反：**先发布快照、再 ping**（理由见 mods-snapshot-export.mjs 的 notifyRevalidate）。
if (updated.length > 0) {
  try {
    await publishSnapshotToCos({
      cos,
      bucket: cosBucket,
      region: cosRegion,
      databaseUrl: process.env.DATABASE_URL?.trim(),
      sqlPath: resolve(process.cwd(), "scripts/mods-snapshot.sql"),
      outPath: resolve(process.cwd(), SNAPSHOT_REL_PATH),
      rawPath: join(tmpdir(), "wavemod-sync-character-images-snapshot-raw.json"),
    });
    console.log("📦 已发布兜底快照到 COS");
  } catch (err) {
    console.warn(`⚠️  兜底快照发布失败: ${err.message}`);
    console.warn("   库内数据已就绪；但若 Supabase 网关被锁，前台仍会显示旧的占位图。");
  }
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
}

console.log("\n完成。");
