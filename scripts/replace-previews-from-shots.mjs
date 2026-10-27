/**
 * 用浮窗截图**替换** mod 的整组预览图（images 数组）。
 *
 * 与既有脚本的分工：
 *   - add-landscape-previews.mjs：把截图**追加**到图集最前面（新键 landscape.webp），原图留着；
 *   - reupload-mod-image.mjs：**覆盖同一个** preview.webp（URL 不变，因此不改库）；
 *   - 本脚本：同样是把截图当作封面，但**换新键**再整组替换 images。
 *
 * 为什么不用同键覆盖：现有的 preview.webp 都带 `public, max-age=604800`
 * （见 scripts/add-landscape-previews.mjs 的 COS_IMAGE_CACHE_CONTROL）。带 max-age 的对象
 * 浏览器 7 天内**不会回源校验**，同键覆盖对老访客等于没换（结论见 reupload-mod-image.mjs:170-173
 * 与记忆 cos-overwrite-visible-only-if-no-cache）。换键 = URL 变 ⇒ 人人都拿到新图，
 * 代价是改库 + 重发兜底快照 + ping，旧对象留成孤儿（几十 KB，且在备份镜像里）。
 *
 * 数据源命名（与 add-landscape-previews.mjs 同口径）：
 *   `弗洛洛-黑化.exe.png`          → title「黑化」   主图（images[0]）
 *   `弗洛洛-黑化.exe-2.png`        → 同一 mod 的第 2 张（images[1]），按图号排序
 *   `…-mosaic.png`                 → 打码版，跳过
 *
 * 图集语义：**旧图整组丢弃**（用户口径「原来的都删了」），images 就是源目录里该 mod 的
 * 全部截图（主图 + -2/-3…）。当前库内所有行都只有 1 张，所以对单图 mod 等价于换封面。
 *
 * 两种特殊 title：
 *   - `尤诺的月环-罪妄月华.png` → 库内 title 是「的月环-罪妄月华」（上传时按角色前缀切掉了角色名），
 *     所以裸角色前缀（不带 `-`）也要切；
 *   - 库里 images[0] 还是占位图 `placeholder/mod-placeholder.webp` 的行，没有自己的目录，
 *     新键落到 `mods/<slugify(character)>/<id>/`（否则多条 mod 会挤在同一个 placeholder 键上）。
 *
 * 用法:
 *   node scripts/replace-previews-from-shots.mjs                       # dry-run
 *   node scripts/replace-previews-from-shots.mjs --apply
 *   node scripts/replace-previews-from-shots.mjs --src="C:\…" --char=绯雪 --key-suffix=20261025
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

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const CHARACTER = readArg("--char")?.trim() || "弗洛洛";
const SRC_DIR = readArg("--src")?.trim() || String.raw`C:\Users\qsy123\Pictures\JASM\浮窗截图`;
const KEY_SUFFIX = readArg("--key-suffix")?.trim() || "20261025";
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";
const isApply = process.argv.includes("--apply");

/** 与每日上传脚本的 PREVIEW_WIDTH 对齐（见 upload-daily-by-date.mjs） */
const PREVIEW_WIDTH = 1000;
const WEBP_QUALITY = 80;
/** 站内图片标准缓存头；新键首发即长缓存，之后要换再换键 */
const COS_IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

// ==================== 文件名 → 库内 title ====================

/** 与 upload-daily-by-date.mjs 同口径：NFKC → 去空白 → 小写。只用于匹配 */
function normKey(text) {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 与 upload-daily-by-date.mjs 同口径（记忆 cos-preview-key-must-slugify） */
function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "mod"
  );
}

/** 返回 { title, index }；打码图返回 null */
function parseSourceName(file) {
  let base = basename(file, extname(file));
  if (/mosaic/i.test(base)) return null;
  if (base.startsWith(`${CHARACTER}-`)) base = base.slice(CHARACTER.length + 1);
  // 「尤诺的月环-罪妄月华」→ 库内 title 是「的月环-罪妄月华」
  else if (base.startsWith(CHARACTER)) base = base.slice(CHARACTER.length).replace(/^[-_\s]+/, "");

  let index = 0;
  const idxMatch = /(?:[-_ ](\d)| ?\((\d)\))$/.exec(base);
  if (idxMatch) {
    const n = Number(idxMatch[1] ?? idxMatch[2]);
    index = Number.isFinite(n) && n >= 2 ? n - 1 : 0;
    base = base.slice(0, idxMatch.index);
  }
  base = base.replace(/\.exe$/i, "").trim();
  return { index, title: base };
}

// ==================== 库内行 ====================

const rows = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id, 'character', character, 'title', title, 'images', images
)), '[]'::json)::text
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

// ==================== 匹配源图 ====================

if (!existsSync(SRC_DIR)) {
  console.error(`❌ 源目录不存在：${SRC_DIR}`);
  process.exit(1);
}
const files = readdirSync(SRC_DIR).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()));
if (files.length === 0) {
  console.error(`❌ 源目录里没有图片：${SRC_DIR}`);
  process.exit(1);
}

/** rowId → { row, shots: [{ file, index }] }；shots 按图号升序，[0] 是封面 */
const plans = new Map();
const unmatchedFiles = [];
const mosaicSkipped = [];
const dupSkipped = [];
const matchedRowIds = new Set();

for (const file of files.sort()) {
  const parsed = parseSourceName(file);
  if (!parsed) {
    mosaicSkipped.push(file);
    continue;
  }
  const row = findRow(parsed.title);
  if (!row) {
    unmatchedFiles.push(`${file}   →   「${parsed.title}」`);
    continue;
  }
  matchedRowIds.add(row.id);
  let plan = plans.get(row.id);
  if (!plan) {
    plan = { row, shots: [] };
    plans.set(row.id, plan);
  }
  if (plan.shots.some((s) => s.index === parsed.index)) {
    console.log(`⚠️  同一行出现两张图号 ${parsed.index + 1}，保留先出现的：${row.title}`);
    dupSkipped.push(`${file}   →   ${row.title}  [重复图号]`);
    continue;
  }
  plan.shots.push({ file, index: parsed.index });
}
for (const plan of plans.values()) plan.shots.sort((a, b) => a.index - b.index);

const rowsWithoutShot = rows.filter((r) => !matchedRowIds.has(r.id)).map((r) => `[${r.id}] ${r.title}`);
const multiShot = [...plans.values()].filter((p) => p.shots.length > 1);

console.log(`\n🖼  源图 ${files.length} 张 → 命中 ${plans.size} 条 mod（其中多图 ${multiShot.length} 条）`);
if (mosaicSkipped.length) console.log(`⏭  打码图跳过 ${mosaicSkipped.length} 张`);
if (dupSkipped.length) {
  console.log(`⏭  重复图号跳过 ${dupSkipped.length} 张：`);
  dupSkipped.forEach((x) => console.log(`   - ${x}`));
}
if (unmatchedFiles.length) {
  console.log(`⚠️  匹配不到库内 title 的 ${unmatchedFiles.length} 张：`);
  unmatchedFiles.forEach((x) => console.log(`   - ${x}`));
}
if (rowsWithoutShot.length) {
  console.log(`ℹ️  库里没有对应截图、保持原样的 ${rowsWithoutShot.length} 条：`);
  rowsWithoutShot.forEach((x) => console.log(`   - ${x}`));
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

function headKey(key) {
  return new Promise((res) => {
    cos.headObject({ Bucket: cosBucket, Region: cosRegion, Key: key }, (err) => res(!err));
  });
}

/**
 * 从库内 URL 反推对象键。库里历史上有三种写法：
 *   1. `mods/fuluoluo/…`（slug）
 *   2. `mods/弗洛洛/…`（中文原文）
 *   3. 百分号编码 / 双重编码（见 scripts/diag-encoded.mjs）
 * 因此按候选逐个 headObject，命中哪个算哪个 —— 拼错就是「传成功了但没人看它」。
 */
async function resolveObjectKey(url) {
  const prefix = `https://${cosBucket}.cos.`;
  if (!url?.startsWith(prefix)) return null;
  const slash = url.indexOf("/", prefix.length);
  if (slash < 0) return null;
  const raw = url.slice(slash + 1).split("?")[0];
  if (!raw) return null;

  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // 非法转义：raw 本身就是唯一候选
  }

  for (const key of candidates) {
    if (await headKey(key)) return key;
  }
  return null;
}

// ==================== 逐条：转码 + 上传 ====================

const prepared = [];
let failedPrep = 0;

for (const { row, shots } of plans.values()) {
  const existingUrl = (row.images ?? [])[0] ?? "";
  const label = `${row.character} | ${row.title}`;
  try {
    const currentKey = await resolveObjectKey(existingUrl);
    if (!currentKey) throw new Error(`无法定位现有对象（库内 URL：${existingUrl || "(无)"}）`);

    // 新键与旧键同目录；新 URL 直接沿用旧 URL 的目录前缀（保留库里原有的编码写法）。
    // 占位图（placeholder/…）没有自己的目录，落到 mods/<slugify(character)>/<id>/，
    // 否则同一批多条 mod 会全部写同一个 placeholder 键、互相覆盖。
    const slash = existingUrl.lastIndexOf("/");
    if (slash < 0) throw new Error(`库内 URL 形态异常：${existingUrl}`);
    const reuseDir = currentKey.startsWith("mods/");
    const dirUrl = reuseDir
      ? existingUrl.slice(0, slash + 1)
      : `https://${cosBucket}.cos.${cosRegion}/mods/${slugify(CHARACTER)}/${row.id}/`;
    const dirKey = reuseDir ? currentKey.slice(0, currentKey.lastIndexOf("/") + 1) : `mods/${slugify(CHARACTER)}/${row.id}/`;
    if (!reuseDir) console.log(`   ℹ️  ${label}：库里是占位图，新键改落 ${dirKey}`);

    const urls = [];
    const buffers = [];
    for (const shot of shots) {
      const suffix = shot.index === 0 ? "" : `-${shot.index + 1}`;
      const raw = readFileSync(join(SRC_DIR, shot.file));
      const meta = await sharp(raw).metadata();
      const buffer = await sharp(raw)
        .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      console.log(
        `   ${label}\n      ${meta.width}x${meta.height} ${(raw.length / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB webp  ${dirKey}preview-${KEY_SUFFIX}${suffix}.webp`
      );
      urls.push(`${dirUrl}preview-${KEY_SUFFIX}${suffix}.webp`);
      buffers.push(buffer);
    }
    prepared.push({ row, urls, buffers, keys: urls.map((u) => `${dirKey}${u.slice(dirUrl.length)}`) });
  } catch (err) {
    failedPrep++;
    console.error(`   ❌ ${label}: ${err.message}`);
  }
}

console.log(`\n📊 可处理 ${prepared.length} 条（共 ${prepared.reduce((n, p) => n + p.keys.length, 0)} 张图），准备失败 ${failedPrep} 条`);

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未上传、未写库。确认无误后加 --apply 执行。");
  process.exit(0);
}
if (prepared.length === 0) {
  console.log("\n✅ 没有需要处理的记录。");
  process.exit(0);
}

const uploaded = [];
for (const item of prepared) {
  const done = [];
  try {
    for (let i = 0; i < item.keys.length; i++) {
      await new Promise((res, rej) => {
        cos.putObject(
          {
            Bucket: cosBucket,
            Region: cosRegion,
            Key: item.keys[i],
            Body: item.buffers[i],
            ContentType: "image/webp",
            CacheControl: COS_IMAGE_CACHE_CONTROL,
          },
          (err) => (err ? rej(new Error(err.message)) : res())
        );
      });
      done.push(i);
    }
    uploaded.push(item);
  } catch (err) {
    // 多图只传成一部分时不能写库：images 里会出现不存在的键
    console.error(`   ❌ 上传失败 ${item.row.title}: ${err.message}（已传 ${done.length}/${item.keys.length}）`);
  }
}
console.log(`\n☁️  上传成功 ${uploaded.length} / ${prepared.length}`);
if (uploaded.length === 0) process.exit(1);

// ==================== 写库：整组替换 images ====================

/**
 * images 直接换成本批新图（主图 + -2/-3…），**旧图整组丢弃**（用户口径「原来的都删了」）。
 * 旧对象留成孤儿（几十 KB，且在备份镜像里），不做 cos.deleteObject —— 删 COS 不可逆。
 */
function buildImagesUpdateSql(items) {
  const values = items
    // 注意写成箭头函数：直接传 dollarQuote 会把 map 的 index 当成 base，标签变成 $0$（psql 语法错）
    .map((u) => `(${dollarQuote(u.row.id)}::uuid, array[${u.urls.map((x) => dollarQuote(x)).join(", ")}]::text[])`)
    .join(",\n    ");
  return `
with incoming(id, urls) as (
  values
    ${values}
),
upd as (
  update mods m
  set images = incoming.urls
  from incoming
  where m.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

console.log(`\n💾 写入 images（${uploaded.length} 条）...`);
let applied = 0;
const BATCH = 50;
for (let i = 0; i < uploaded.length; i += BATCH) {
  const slice = uploaded.slice(i, i + BATCH);
  try {
    const outcome = await psqlJson(buildImagesUpdateSql(slice));
    const updated = Number(outcome?.updated ?? 0);
    applied += updated;
    console.log(`   批次 ${Math.floor(i / BATCH) + 1}: 更新 ${updated} 条`);
  } catch (err) {
    console.error(`   ❌ 批次失败: ${err.message}`);
  }
}
console.log(`\n📊 写库完成：成功 ${applied}，失败 ${uploaded.length - applied}`);

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

  // ⚠️ ping 只清上游 Next，清不到香港反代那层：`location = /api/mods` 是
  // proxy_cache_valid 7200s + 忽略 Cache-Control，按角色筛选的列表还会给旧 JSON 两小时
  // （2026-10-25 实例：页面 65 张图 0 张新的）。这一步必须补上，否则用户会说「没生效」。
  const encodedChar = encodeURIComponent(CHARACTER);
  console.log(`\n🧹 还要清反代缓存，否则列表最多旧 2 小时：`);
  console.log(`   node scripts/purge-hk-api-cache.mjs --pattern='character=${encodedChar}'`);
}
