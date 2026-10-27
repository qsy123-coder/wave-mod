/**
 * 给已有 mod **追加**「横屏」预览图，并把它放到封面（images[0]），原有预览图顺延到后面。
 *
 * 与 reupload-mod-image.mjs 的区别：那个是**覆盖**同一张图（URL 不变），
 * 这个**不碰**原来的 preview.webp —— 新图走新键 `landscape.webp` / `landscape-2.webp`，
 * 插到数组最前面。images 的顺序就是站内顺序（images[0] 是封面，见 mods-domain/mappers.ts），
 * 所以卡片瀑布流会按横屏比例排、详情页大图也是这张，原图留在图集里可翻。
 *
 * 数据源：`C:\Users\qsy123\Pictures\JASM\浮窗截图\<角色>\`，文件名 = 库内 title（可带 `角色-` 前缀、
 * 可带 `.exe`），同一 mod 的第 2 张起用 `-2` / ` (2)` 后缀（与每日脚本的额外图口径一致）。
 *
 * ⚠️ 对象键的目录前缀**从库内 images[0] 反推**（历史上有 mods/feixue/ 与 mods/绯雪/ 两种写法），
 * 不自己拼 slug —— 拼错就是「传成功了但没人看它」。
 *
 * 用法:
 *   node scripts/add-landscape-previews.mjs                 # dry-run，只列匹配结果
 *   node scripts/add-landscape-previews.mjs --apply         # 转码 + 上传 + 写库 + 发快照 + ping
 *   node scripts/add-landscape-previews.mjs --limit=5 --apply
 *   node scripts/add-landscape-previews.mjs --char=千咲     # 换角色（源目录默认 …\浮窗截图\<角色>）
 *
 * ⚠️ PowerShell 5.1 传中文参数会乱码，中文角色名请写进一个临时启动器脚本再转发 argv。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });
requireDatabaseUrl();

const cliArgs = process.argv.slice(2);
const readArg = (name) => cliArgs.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3).trim();

const CHARACTER = readArg("char") || "绯雪";
const SRC_DIR = readArg("src") || String.raw`C:\Users\qsy123\Pictures\JASM\浮窗截图\${CHARACTER}`;
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";

/** 与 src/lib/cos/shared.ts 的 COS_IMG_HERO 一致：详情大图按 1280 请求，再大也不会被用到 */
const PREVIEW_WIDTH = 1280;
const WEBP_QUALITY = 82;
const COS_IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";
const KEY_BASE = "landscape";
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const isApply = cliArgs.includes("--apply");
const limitArg = cliArgs.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

// ==================== 文件名 → 库内 title ====================

/**
 * 与 upload-daily-by-date.mjs 同口径的归一：NFKC（全角括号/数字）→ 去空白 → 小写。
 * 只用于**匹配**，不写回任何地方 —— 所以不会破坏标题里原本的全角写法。
 */
function normKey(text) {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * 截图文件名 → { title, index }。
 *   `绯雪-东煌v1.3 （小键盘1~9切换）.exe.png`      → { title: "东煌v1.3 （小键盘1~9切换）", index: 0 }
 *   `绯雪-丰汝绯屯 by Xezel3D（…切换）.exe-2.png`  → { …, index: 1 }
 *   `绯雪-绯红霜v3.4（0切换）by nom.exe (2).png`   → { …, index: 1 }
 * 带 mosaic 的返回 null：那是打码版，别当封面。
 */
function parseSourceName(file) {
  let base = basename(file, extname(file));
  if (/mosaic/i.test(base)) return null;
  if (base.startsWith(`${CHARACTER}-`)) base = base.slice(CHARACTER.length + 1);
  // 「千咲的剪刀-武士刀」→ 库内 title 是「的剪刀-武士刀」（上传时按角色前缀切掉了角色名）；
  // 「千咲皮肤[蜜桃冰]-简化」→「皮肤[蜜桃冰]-简化」。裸角色前缀（不带 `-`）同样要切。
  else if (base.startsWith(CHARACTER)) base = base.slice(CHARACTER.length).replace(/^[-_\s]+/, "");

  let index = 0;
  const idxMatch = /(?:[-_ ](\d)| ?\((\d)\))$/.exec(base);
  if (idxMatch) {
    const n = Number(idxMatch[1] ?? idxMatch[2]);
    // `(2)` / `-2` 都表示第 2 张，下标从 0 起
    index = Number.isFinite(n) && n >= 2 ? n - 1 : 0;
    base = base.slice(0, idxMatch.index);
  }
  base = base.replace(/\.exe$/i, "").trim();
  return { index, title: base };
}

// ==================== 库内行 ====================

const ROW_COLUMNS =
  "json_build_object('id', id, 'character', character, 'title', title, 'images', images)";

const rows = await psqlJson(`
select coalesce(json_agg(${ROW_COLUMNS}), '[]'::json)::text
from mods
where character = ${dollarQuote(CHARACTER)}
`);

console.log(`🗄  库内 [${CHARACTER}] ${rows.length} 条`);

const byExact = new Map();
const byNorm = new Map(); // normKey → row | "AMBIGUOUS"
for (const row of rows) {
  byExact.set(row.title, row);
  const key = normKey(row.title);
  if (byNorm.has(key) && byNorm.get(key) !== row) byNorm.set(key, "AMBIGUOUS");
  else byNorm.set(key, row);
}

function findRow(title) {
  const exact = byExact.get(title);
  if (exact) return exact;
  const hit = byNorm.get(normKey(title));
  return hit && hit !== "AMBIGUOUS" ? hit : null;
}

/** 角色下最常用的对象目录前缀（mods/feixue/ 还是 mods/绯雪/）—— 只给「没有 COS 图」的行兜底 */
function dominantPrefix() {
  const tally = new Map();
  for (const row of rows) {
    const m = /^https:\/\/[^/]+\/(mods\/[^/]+\/)/.exec(row.images?.[0] ?? "");
    if (m) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `mods/${CHARACTER}/`;
}

const FALLBACK_PREFIX = dominantPrefix();
console.log(`📁 对象目录前缀: ${FALLBACK_PREFIX}`);

/** 从库内 images[0] 反推 `mods/<slug>/<id>/`；不是本桶 COS 地址就用兜底前缀 */
function dirFromRow(row, bucket) {
  const url = row.images?.[0] ?? "";
  const prefix = `https://${bucket}.cos.`;
  if (url.startsWith(prefix)) {
    const slash = url.indexOf("/", prefix.length);
    const key = slash >= 0 ? url.slice(slash + 1) : "";
    const dir = key.slice(0, key.lastIndexOf("/") + 1);
    // ⚠️ 占位图 `placeholder/mod-placeholder.webp` 是所有行共用的目录：照它落键会让
    // 多条 mod 写同一个 landscape.webp、互相覆盖（2026-10-27 千咲「的剪刀-艾莲武器」等踩到）。
    if (dir && !dir.startsWith("placeholder/")) return dir;
  }
  return `${FALLBACK_PREFIX}${row.id}/`;
}

// ==================== 匹配 ====================

const files = existsSync(SRC_DIR)
  ? readdirSync(SRC_DIR).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
  : [];
if (files.length === 0) {
  console.error(`❌ 源目录里没有图片：${SRC_DIR}`);
  process.exit(1);
}

/** rowId → [{ file, index }] */
const plans = new Map();
const unmatched = [];
const skippedMosaic = [];

for (const file of files.sort()) {
  const parsed = parseSourceName(file);
  if (!parsed) {
    skippedMosaic.push(file);
    continue;
  }
  const row = findRow(parsed.title);
  if (!row) {
    unmatched.push(`${file}   →   「${parsed.title}」`);
    continue;
  }
  const list = plans.get(row.id) ?? [];
  list.push({ file, index: parsed.index, row });
  plans.set(row.id, list);
}

console.log(`\n🖼  源图 ${files.length} 张 → 匹配 ${plans.size} 条 mod`);
if (skippedMosaic.length) {
  console.log(`⏭  打码图跳过 ${skippedMosaic.length} 张：`);
  skippedMosaic.forEach((f) => console.log(`   - ${f}`));
}
if (unmatched.length) {
  console.log(`⚠️  匹配不到的 ${unmatched.length} 张：`);
  unmatched.forEach((u) => console.log(`   - ${u}`));
}
const rowsWithoutShot = rows.filter((r) => !plans.has(r.id));
if (rowsWithoutShot.length) {
  console.log(`ℹ️  库里没有对应截图、保持原样的 ${rowsWithoutShot.length} 条：`);
  rowsWithoutShot.forEach((r) => console.log(`   - [${r.id}] ${r.title}`));
}

// ==================== COS 客户端 ====================

const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS_BUCKET / COS_REGION（本地在 .env.local）");
  process.exit(1);
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID?.trim(),
  SecretKey: process.env.COS_SECRET_KEY?.trim(),
});

function putObject(key, body) {
  return new Promise((res, rej) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: key,
        Body: body,
        ContentType: "image/webp",
        CacheControl: COS_IMAGE_CACHE_CONTROL,
      },
      (err) => (err ? rej(new Error(err.message)) : res())
    );
  });
}

// ==================== 转码 + 上传 ====================

const todo = [...plans.values()].slice(0, LIMIT);
if (todo.length !== plans.size) console.log(`\n（本次按 --limit 只处理前 ${todo.length} 条）`);

const updates = [];
let converted = 0;
let failed = 0;

for (const entries of todo) {
  const row = entries[0].row;
  const label = `${row.character} | ${row.title}`;
  entries.sort((a, b) => a.index - b.index);
  try {
    const dir = dirFromRow(row, cosBucket);
    const urls = [];

    for (const [i, entry] of entries.entries()) {
      const raw = readFileSync(join(SRC_DIR, entry.file));
      const meta = await sharp(raw).metadata();
      const buffer = await sharp(raw)
        .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      const name = i === 0 ? KEY_BASE : `${KEY_BASE}-${i + 1}`;
      const objectKey = `${dir}${name}.webp`;
      console.log(
        `   ${label}${i > 0 ? `  [图 ${i + 1}]` : ""}\n      ${meta.width}x${meta.height} ${(raw.length / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB webp  ${objectKey}`
      );
      if (isApply) {
        await putObject(objectKey, buffer);
        urls.push(`https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`);
      }
    }
    if (isApply) updates.push({ id: row.id, urls });
    converted++;
  } catch (err) {
    failed++;
    console.error(`   ❌ ${label}: ${err.message}`);
  }
}

console.log(`\n📊 转换成功 ${converted}，失败 ${failed}`);

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未上传、未写库。确认无误后加 --apply 执行。");
  process.exit(0);
}
if (updates.length === 0) {
  console.log("\n✅ 没有需要写入的记录。");
  process.exit(0);
}

// ==================== 写库 ====================

/**
 * 新图整体放进最前面，原来的图原样跟在后面（顺序不变）。
 * 用 `url << any(array)` 过滤重复，重跑脚本不会把同一张图插两遍。
 * id 走 ::uuid 强转，URL 里的 ? & 不必手工转义。
 */
function buildImagesUpdateSql(items) {
  const values = items
    .map((u) => `(${dollarQuote(u.id)}::uuid, array[${u.urls.map((x) => dollarQuote(x)).join(",")}]::text[])`)
    .join(",\n    ");
  return `
with incoming(id, urls) as (
  values
    ${values}
),
upd as (
  update mods m
  set images = incoming.urls || (
    select coalesce(array_agg(u order by ord), '{}'::text[])
    from unnest(coalesce(m.images, '{}'::text[])) with ordinality as t(u, ord)
    where not (u = any(incoming.urls))
  )
  from incoming
  where m.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

console.log(`\n💾 写入 ${updates.length} 条 images...`);
let applied = 0;
const BATCH = 50;
for (let i = 0; i < updates.length; i += BATCH) {
  const slice = updates.slice(i, i + BATCH);
  const batchNum = Math.floor(i / BATCH) + 1;
  const totalBatches = Math.ceil(updates.length / BATCH);
  try {
    const outcome = await psqlJson(buildImagesUpdateSql(slice));
    const updated = Number(outcome?.updated ?? 0);
    applied += updated;
    console.log(`   批次 ${batchNum}/${totalBatches}: 更新 ${updated} 条`);
  } catch (err) {
    console.error(`  ❌ 批次 ${batchNum}/${totalBatches} 失败: ${err.message}`);
  }
}
console.log(`\n📊 写库完成：成功 ${applied}，失败 ${updates.length - applied}`);

// 顺序不能反：先发快照、再 ping（见 mods-snapshot-export.mjs 的 notifyRevalidate 注释）
if (applied > 0) {
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
    console.log("☁️  兜底快照已重发");
  } catch (err) {
    console.warn(`⚠️  兜底快照发布失败：${err.message}`);
    console.warn("   库内数据已就绪；Supabase 网关被锁时前台会继续读旧快照。");
  }
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
}
