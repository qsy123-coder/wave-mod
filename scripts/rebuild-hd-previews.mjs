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
/**
 * 额外扫描目录（可多次给）：把重新下载解压的 mod 包放哪里都行，不必塞进 W-* 日期目录。
 * 解压出来的包里图叫 `Preview.png` 且躺在**以 mod 命名的文件夹**里，所以这棵树按
 * 「图片所在文件夹名」当 base；日期目录那棵仍按图片文件名当 base。
 */
const EXTRA_SRCS = cliArgs.filter((a) => a.startsWith("--src=")).map((a) => a.slice(6));
/**
 * 从 COS 上残留的**非 webp 原图**取源（`mods/<slug>/<modId>/preview.png|jpg`）。
 * 这批是 2026-07 批量转 webp 时没删掉的原始文件，900–1000px 宽、1MB 上下，
 * 且键里带 mod id ⇒ 不靠标题匹配，也不会认错行。比任何下载路径都省事。
 */
const FROM_COS = cliArgs.includes("--from-cos");

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

  /**
   * `--src` 树：递归找图，base 取**图片所在文件夹名**。
   * 解压出来的包结构是 `<mod名>/Preview.png`（同级还有 Normal/、Textures/ 等），
   * 按文件名当 base 全是 "Preview"，只有文件夹名对得上库内 title。
   * 深度上限 4 层，免得扫进 Textures 里的 dds/大图。
   */
  for (const root of EXTRA_SRCS) {
    if (!existsSync(root)) {
      console.warn(`⚠️  --src 目录不存在：${root}`);
      continue;
    }
    const walk = (dir, depth) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (depth < 4) walk(full, depth + 1);
          continue;
        }
        const ext = extname(e.name).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) continue;
        // 只要「文件夹里的预览图」：文件名以 preview 开头才认，避免把贴图当预览
        if (!/^preview/i.test(basename(e.name, extname(e.name)))) continue;
        const base = basename(dir);
        if (!index.has(base)) index.set(base, full);
      }
    };
    walk(root, 0);
  }
  return index;
}

// ==================== COS 客户端（--from-cos 列桶时要，放在最前面免得 TDZ） ====================

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
/** 同一条 mod 可能同时有本地原图和 COS 原图，只做一次 */
const plannedIds = new Set();

function pushPlan(row, source) {
  if (plannedIds.has(row.id)) return;
  const currentUrl = (row.images ?? [])[0] ?? "";
  if (currentUrl.endsWith(`/${HD_FILENAME}`)) {
    skipped.push(`${row.character} | ${row.title}（已是 hd）`);
    return;
  }
  plannedIds.add(row.id);
  plans.push({ row, currentUrl, ...source });
}

/** 分页列出 COS 对象（getBucket 单页上限 1000） */
function listAll(prefix) {
  return new Promise((res, rej) => {
    const out = [];
    const next = (marker) => {
      cos.getBucket(
        { Bucket: cosBucket, Region: cosRegion, Prefix: prefix, Marker: marker, MaxKeys: 1000 },
        (err, data) => {
          if (err) return rej(err);
          for (const o of data.Contents ?? []) out.push({ key: o.Key, size: Number(o.Size) });
          if (data.IsTruncated === "true" && data.NextMarker) next(data.NextMarker);
          else res(out);
        }
      );
    };
    next("");
  });
}

for (const [base, file] of localIndex) {
  const row = findRowForBase(base);
  if (!row) {
    unmatched.push(base);
    continue;
  }
  pushPlan(row, { kind: "file", file, base });
}

if (FROM_COS) {
  // 列出 mods/ 下的非 webp 原图，按对象键里的 mod id 归并（同一个 mod 多份取最大的）
  const objs = await listAll("mods/");
  const byModId = new Map();
  for (const o of objs) {
    if (/\.webp$/i.test(o.key) || !/\.(png|jpe?g)$/i.test(o.key)) continue;
    const m = /^mods\/[^/]+\/([0-9a-f-]{36})\//i.exec(o.key);
    if (!m) continue;
    const prev = byModId.get(m[1]);
    if (!prev || o.size > prev.size) byModId.set(m[1], o);
  }
  console.log(`\n☁️  COS 上的非 webp 原图: ${byModId.size} 个 mod`);

  const ids = [...byModId.keys()];
  const rowsById = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const json = await psqlJson(`
select coalesce(json_agg(${ROW_COLUMNS}), '[]'::json)::text
from mods
where id = any(array[${slice.map((s) => dollarQuote(s)).join(",")}]::uuid[])
`);
    for (const r of json) rowsById.set(r.id, r);
  }

  let added = 0;
  for (const [id, o] of byModId) {
    const row = rowsById.get(id);
    if (!row) continue;
    const before = plans.length;
    pushPlan(row, {
      kind: "cos",
      url: `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${o.key}`,
      base: row.title,
    });
    if (plans.length > before) added++;
  }
  console.log(`   其中可重做: ${added} 条（含与本地重复的会自动跳过）`);
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

/** 取源图字节：本地文件直接读，COS 原图走 https（公开读，不需要签名） */
async function loadSource(item) {
  if (item.kind === "cos") {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`下载原图失败 HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(item.file);
}

for (const item of todo) {
  const { row } = item;
  const label = `${row.character} | ${row.title}`;
  try {
    const raw = await loadSource(item);
    const src = await sharp(raw).metadata();
    const buffer = await sharp(raw)
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
