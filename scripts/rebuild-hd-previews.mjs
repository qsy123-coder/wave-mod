/**
 * 把「本地还有原图」的 mod 预览图重做成 1000px，并换到**新的对象键** `preview-hd.webp`。
 *
 * 背景（见 docs/card-preview-sharpness-prd.md）：库存预览图绝大多数只有 560px，
 * 而卡片真正吃像素的是瀑布流里横跨两列的大卡（手机 ~355 / 桌面 5 列 ~490 CSS px，
 * 2x 屏要 710/980 设备像素）。渲染层 `imageMogr2/thumbnail/Nx%3E` 只缩不放，
 * 图源多高就是天花板 —— 只能重做图本身。
 *
 * 为什么不覆盖原来的 `preview.webp`：
 *   老对象的响应头是 `Cache-Control: max-age=604800`，**已经缓存过旧图的浏览器会继续
 *   用那张 560 最多 7 天** —— 覆盖同键（哪怕新对象带 no-cache）改不了别人手里的旧副本。
 *   写新键 + 改库里的 images[0]，前台下一跳就拿到新图，也不影响其它按 URL 精确比较的逻辑
 *   （占位图判据、图库去重、后台回填）。
 *
 * 数据源：日期目录 W-YYYY.M.D 下的原图（上传后一般会被清掉，所以只覆盖「还在」的那批）。
 * 匹配：图片 base = 库内 title，或 = 「character-title」（每日脚本剥过前缀的写法）。
 *
 * 用法:
 *   node scripts/rebuild-hd-previews.mjs                 # dry-run，只列清单
 *   node scripts/rebuild-hd-previews.mjs --apply         # 重做 + 写库 + 发快照 + ping
 *   node scripts/rebuild-hd-previews.mjs --limit=10 --apply
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import sharp from "sharp";

import { resolveDakaTarget } from "./daka-classify.mjs";
import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });
requireDatabaseUrl();

const BASE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";
const GAME_KEY = "wuthering-waves";

/** 与 upload-daily-by-date.mjs 的 PREVIEW_WIDTH 保持一致：新图入库就是 1000 */
const PREVIEW_WIDTH = 1000;
const WEBP_QUALITY = 80;
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
/** 与 src/lib/cos/shared.ts 的 COS_IMAGE_CACHE_CONTROL 一致（新键，用正常缓存策略即可） */
const COS_IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";
const HD_FILENAME = "preview-hd.webp";

const cliArgs = process.argv.slice(2);
const isApply = cliArgs.includes("--apply");
const limitArg = cliArgs.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

// ==================== 本地原图索引 ====================

/**
 * 扫日期目录里还留着的原图，返回 Map<base, filePath>。
 * 与每日脚本同口径：先顶层，再「预览图」子目录；顶层优先。
 */
function buildLocalImageIndex() {
  const index = new Map();
  const dirs = readdirSync(BASE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^W-\d{4}\.\d{1,2}\.\d{1,2}$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const addFrom = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const ext = extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const base = basename(e.name, extname(e.name));
      if (!index.has(base)) index.set(base, join(dir, e.name));
    }
  };

  for (const d of dirs) {
    const dir = join(BASE, d.name);
    addFrom(dir);
    addFrom(join(dir, "预览图"));
  }
  return index;
}

// ==================== 库内行 ====================

const ROW_COLUMNS =
  "json_build_object('id', id, 'character', character, 'title', title, 'images', images)";

const rows = await psqlJson(`
select coalesce(json_agg(${ROW_COLUMNS}), '[]'::json)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)}
  and is_published
  and coalesce(images[1], '') like 'https://%.cos.%.myqcloud.com/%'
`);

const localIndex = buildLocalImageIndex();
console.log(`📁 本地原图: ${localIndex.size} 张`);
console.log(`🗄  库内带 COS 图的记录: ${rows.length} 条\n`);

/** 图片 base → 可能的 title 写法（每日脚本会剥掉「角色-」前缀，两种都要试） */
const byTitle = new Map();
/** `${character}|${title}`：大卡那类改过分类的 mod 靠这张表兜底 */
const byCharTitle = new Map();
for (const r of rows) {
  byTitle.set(r.title, r);
  const prefixed = `${r.character}-${r.title}`;
  if (!byTitle.has(prefixed)) byTitle.set(prefixed, r);
  byCharTitle.set(`${r.character}|${r.title}`, r);
}

/**
 * 兜底匹配：`卡提希娅-大卡-休闲优雅（789）by woju` 这类会被每日脚本
 * 按 daka 规则归到「芙露德莉斯」，title 也只剩 `大卡-…` 一段 ——
 * 直接按 title 前缀对不上，得走同一套 daka 规则算 (character, title) 再查。
 */
function findRowForBase(base) {
  const direct = byTitle.get(base);
  if (direct) return direct;
  const target = resolveDakaTarget(base);
  return byCharTitle.get(`${target.character}|${target.title}`) ?? null;
}

const plans = [];
const unmatched = [];
const skipped = [];

for (const [base, file] of localIndex) {
  const row = findRowForBase(base);
  if (!row) {
    unmatched.push(base);
    continue;
  }
  const currentUrl = (row.images ?? [])[0] ?? "";
  if (currentUrl.endsWith(`/${HD_FILENAME}`)) {
    skipped.push(`${row.character} | ${row.title}（已是 hd）`);
    continue;
  }
  plans.push({ row, file, base, currentUrl });
}

console.log(`✅ 可重做: ${plans.length} 条`);
if (skipped.length) console.log(`⏭  已是 hd 跳过: ${skipped.length} 条`);
if (unmatched.length) {
  console.log(`⚠️  本地有图但库里匹配不到: ${unmatched.length} 条`);
  unmatched.slice(0, 20).forEach((b) => console.log(`   - ${b}`));
}

const todo = plans.slice(0, LIMIT);
if (todo.length !== plans.length) console.log(`\n（本次按 --limit 只处理前 ${todo.length} 条）`);

// ==================== 转换 + 上传 ====================

/** 从库内 URL 反推对象键，再把文件名换成 preview-hd.webp（保留原目录，兼容 mods/mod/... 那类历史前缀） */
function hdKeyFromUrl(url, bucket) {
  const prefix = `https://${bucket}.cos.`;
  if (!url?.startsWith(prefix)) return null;
  const slash = url.indexOf("/", prefix.length);
  if (slash < 0) return null;
  const key = url.slice(slash + 1);
  if (key.includes("?")) return null;
  const dir = key.slice(0, key.lastIndexOf("/") + 1);
  return `${dir}${HD_FILENAME}`;
}

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

function putObject(key, buffer) {
  return new Promise((res, rej) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: key,
        Body: buffer,
        ContentType: "image/webp",
        CacheControl: COS_IMAGE_CACHE_CONTROL,
      },
      (err) => (err ? rej(new Error(err.message)) : res())
    );
  });
}

const updates = [];
let converted = 0;
let failed = 0;

for (const item of todo) {
  const { row, file } = item;
  const label = `${row.character} | ${row.title}`;
  try {
    const src = await sharp(file).metadata();
    const buffer = await sharp(readFileSync(file))
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const hdKey = hdKeyFromUrl(item.currentUrl, cosBucket);
    if (!hdKey) throw new Error("无法从库内 URL 反推对象键");

    const outW = Math.min(src.width ?? PREVIEW_WIDTH, PREVIEW_WIDTH);
    console.log(
      `   ${label}\n      ${src.width}x${src.height} → ${outW}w webp ${(buffer.length / 1024).toFixed(0)}KB  ${hdKey}`
    );

    if (isApply) {
      await putObject(hdKey, buffer);
      updates.push({ id: row.id, url: `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${hdKey}` });
    }
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
 * `images` 是 text[]，只改第 1 个元素，其余（多图记录）原样保留。
 * id 走 ::uuid 强转，URL 里的 ? & 不必手工转义。
 */
function buildImagesUpdateSql(items) {
  const values = items.map((u) => `(${dollarQuote(u.id)}::uuid, ${dollarQuote(u.url)})`).join(",\n    ");
  return `
with incoming(id, url) as (
  values
    ${values}
),
upd as (
  update mods m
  set images[1] = incoming.url
  from incoming
  where m.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

console.log(`\n💾 写入 ${updates.length} 条 images[1]...`);
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
    console.log(`  批次 ${batchNum}/${totalBatches}: 更新 ${updated} 条`);
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
