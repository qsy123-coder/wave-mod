/**
 * 把「打码版」预览图换成 mod 的封面（images[0]）。
 *
 * 数据源命名（打码件由外部工具产出，文件名自带 mod id，不需要按标题猜）：
 *   `<mod-uuid>-preview-<suffix>-blur.webp`
 *   → key `mods/<character>/<id>/preview-<suffix>-blur.webp`
 *   → images[0] 指向该 URL（其余图按原顺序留在后面）
 *
 * 为什么不覆盖原来的 `preview-<suffix>.webp`：带 `max-age=604800` 的对象同键覆盖，
 * 7 天内不回源校验的老访客看到的还是原图（记忆 cos-overwrite-visible-only-if-no-cache）。
 * 换键 = URL 变 ⇒ 人人立刻拿到打码版；旧的原图留成孤儿（几十 KB，且备份镜像里有）。
 *
 * 打码件已经是成品 WebP（由用户裁好码区），**不重新转码**，原样上传，只补缓存头。
 *
 * 用法:
 *   node scripts/apply-blur-previews.mjs --src="C:\…\blur-batch"          # dry-run
 *   node scripts/apply-blur-previews.mjs --src="C:\…\blur-batch" --apply
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";

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

const SRC_DIR = readArg("--src")?.trim();
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";
const isApply = process.argv.includes("--apply");

/** 站内图片标准缓存头（与 upload-daily-by-date.mjs / replace-previews-from-shots.mjs 一致） */
const COS_IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";
/** `<uuid>-preview-<suffix>-blur.webp` */
const NAME_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-preview-(\d+)-blur(\.[a-z]+)$/i;

const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS_BUCKET / COS_REGION（本地在 .env.local）");
  process.exit(1);
}
const COS_PREFIX = `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/`;
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID?.trim(),
  SecretKey: process.env.COS_SECRET_KEY?.trim(),
});

// ==================== 读源目录 ====================

if (!SRC_DIR) {
  console.error(`❌ 必须指定 --src=<打码图目录>`);
  process.exit(1);
}
if (!existsSync(SRC_DIR)) {
  console.error(`❌ 源目录不存在：${SRC_DIR}`);
  process.exit(1);
}

const blurFiles = [];
const ignored = [];
for (const file of readdirSync(SRC_DIR).sort()) {
  const m = NAME_RE.exec(file);
  if (!m) {
    ignored.push(file);
    continue;
  }
  blurFiles.push({ file, id: m[1].toLowerCase(), suffix: m[2], ext: m[3].toLowerCase() });
}
console.log(`🖼  打码图 ${blurFiles.length} 张（忽略 ${ignored.length} 个文件名不合规的）`);
if (ignored.length) ignored.forEach((f) => console.log(`   - ${f}`));

// ==================== 查库 ====================

const ids = [...new Set(blurFiles.map((f) => f.id))];
const rows = ids.length
  ? await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id, 'character', character, 'title', title, 'images', images
)), '[]'::json)::text
from mods
where id in (${ids.map((x) => `${dollarQuote(x)}::uuid`).join(", ")})
`)
  : [];
const byId = new Map(rows.map((r) => [r.id, r]));
console.log(`🗄  库内命中 ${rows.length} / ${ids.length} 条`);

// ==================== 逐条：校验 + 上传 ====================

const prepared = [];
const skipped = [];

for (const item of blurFiles) {
  const row = byId.get(item.id);
  if (!row) {
    skipped.push(`${item.file}   →   库里没有这个 id`);
    continue;
  }
  const cover = (row.images ?? [])[0] ?? "";
  if (!cover.startsWith(COS_PREFIX)) {
    skipped.push(`${item.file}   →   ${row.title}  封面不是本桶对象：${cover || "(无)"}`);
    continue;
  }
  const dirUrl = cover.slice(0, cover.lastIndexOf("/") + 1);
  const coverName = cover.slice(cover.lastIndexOf("/") + 1);
  const already = coverName.endsWith(`-blur${item.ext}`);
  if (!already && !coverName.includes(`preview-${item.suffix}`)) {
    skipped.push(`${item.file}   →   ${row.title}  封面是 ${coverName}，与文件名里的 ${item.suffix} 不符（先确认是不是要换的这批）`);
    continue;
  }

  const newName = `preview-${item.suffix}-blur${item.ext}`;
  const newUrl = `${dirUrl}${newName}`;
  const key = newUrl.slice(COS_PREFIX.length);
  const buffer = readFileSync(join(SRC_DIR, item.file));
  console.log(`   ${row.character} | ${row.title}\n      ${(buffer.length / 1024).toFixed(0)}KB  ${key}${already ? "  (已是打码版，重传)" : ""}`);
  prepared.push({ row, key, newUrl, buffer, contentType: item.ext === ".png" ? "image/png" : "image/webp" });
}

if (skipped.length) {
  console.log(`\n⚠️  跳过 ${skipped.length} 条：`);
  skipped.forEach((x) => console.log(`   - ${x}`));
}
console.log(`\n📊 可处理 ${prepared.length} 条`);

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
  try {
    await new Promise((res, rej) => {
      cos.putObject(
        {
          Bucket: cosBucket,
          Region: cosRegion,
          Key: item.key,
          Body: item.buffer,
          ContentType: item.contentType,
          CacheControl: COS_IMAGE_CACHE_CONTROL,
        },
        (err) => (err ? rej(new Error(err.message)) : res())
      );
    });
    uploaded.push(item);
  } catch (err) {
    console.error(`   ❌ 上传失败 ${item.row.title}: ${err.message}`);
  }
}
console.log(`\n☁️  上传成功 ${uploaded.length} / ${prepared.length}`);
if (uploaded.length === 0) process.exit(1);

// ==================== 写库：换 images[0]，其余图原序跟在后面 ====================

function buildImagesUpdateSql(items) {
  const values = items
    .map((u) => `(${dollarQuote(u.row.id)}::uuid, ${dollarQuote(u.newUrl)})`)
    .join(",\n    ");
  return `
with incoming(id, url) as (
  values
    ${values}
),
upd as (
  update mods m
  set images = array[incoming.url] || (
    select coalesce(array_agg(u order by ord), '{}'::text[])
    from unnest(coalesce(m.images, '{}'::text[])) with ordinality as t(u, ord)
    where ord > 1
  )
  from incoming
  where m.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

console.log(`\n💾 写入 images[0]（${uploaded.length} 条）...`);
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
  }
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });

  // ping 清不到香港反代那层（/api/mods 按角色缓存 2h），受影响角色要单独清
  const chars = [...new Set(uploaded.map((u) => u.row.character))];
  console.log(`\n🧹 还要清反代缓存，否则列表最多旧 2 小时：`);
  for (const c of chars) {
    console.log(`   node scripts/purge-hk-api-cache.mjs --pattern='character=${encodeURIComponent(c)}'`);
  }
}
