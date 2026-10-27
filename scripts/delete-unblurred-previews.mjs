/**
 * 删掉「打码版的未打码孪生图」—— 即 images[0] 是 `…-blur.webp` 的 mod，
 * 它旁边同目录下还留着的那张 `…（不带 -blur）.webp`。
 *
 * 为什么需要：apply-blur-previews.mjs 换键时把原图留成了孤儿（几十 KB、备份镜像里有）。
 * 用户 2026-10-27 明确要求「COS 里没打码的删掉」——打码的存在意义就是别让人拿到原图，
 * 留一个可直接猜到的 URL 等于没打码。
 *
 * ⚠️ 不可逆。删之前逐条 headObject 确认键存在，删完再 headObject 确认已消失。
 * 默认只删 **带 -blur 的行的孪生图**（键名 = 打码键去掉 `-blur`）。
 * 加 `--include-legacy` 再顺带删同目录下更早的 `preview.webp`（换浮窗图之前的旧封面，
 * 同样是没打码的版本）——这两批都已无任何引用（库与兜底快照都指向 -blur 键）。
 *
 * 用法:
 *   node scripts/delete-unblurred-previews.mjs                      # dry-run（只列出）
 *   node scripts/delete-unblurred-previews.mjs --apply              # 真删孪生图
 *   node scripts/delete-unblurred-previews.mjs --include-legacy --apply   # 连旧封面一起删
 *   node scripts/delete-unblurred-previews.mjs --char=尤诺 --apply   # 只处理某个角色
 */

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import { resolve } from "node:path";

import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });
requireDatabaseUrl();

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length)?.trim();
}

const CHARACTER = readArg("--char");
const isApply = process.argv.includes("--apply");
const includeLegacy = process.argv.includes("--include-legacy");

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

function headKey(key) {
  return new Promise((res) => {
    cos.headObject({ Bucket: cosBucket, Region: cosRegion, Key: key }, (err) => res(!err));
  });
}
function deleteKey(key) {
  return new Promise((res, rej) => {
    cos.deleteObject({ Bucket: cosBucket, Region: cosRegion, Key: key }, (err) => (err ? rej(err) : res()));
  });
}

// ==================== 找出打码行 ====================

const rows = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id, 'character', character, 'title', title, 'cover', images[1]
)), '[]'::json)::text
from mods
where images[1] like '%-blur.%'
${CHARACTER ? `  and character = ${dollarQuote(CHARACTER)}` : ""}
`);
console.log(`🗄  打码作封面的记录 ${rows.length} 条`);

// ==================== 逐条定位孪生键 ====================

const targets = [];
const missing = [];
for (const row of rows) {
  const cover = row.cover ?? "";
  if (!cover.startsWith(COS_PREFIX)) {
    missing.push(`${row.title}  封面不是本桶对象：${cover || "(无)"}`);
    continue;
  }
  const key = cover.slice(COS_PREFIX.length);
  // `…/preview-20261027-blur.webp` → `…/preview-20261027.webp`
  const twinKey = key.replace(/-blur(\.[a-z0-9]+)$/i, "$1");
  if (twinKey === key) {
    missing.push(`${row.title}  键名里没有 -blur：${key}`);
    continue;
  }
  const keys = [];
  if (await headKey(twinKey)) keys.push(twinKey);
  else missing.push(`${row.title}  孪生图不存在（可能已删）：${twinKey}`);

  if (includeLegacy) {
    const legacyKey = `${key.slice(0, key.lastIndexOf("/") + 1)}preview.webp`;
    if (legacyKey !== twinKey && (await headKey(legacyKey))) keys.push(legacyKey);
  }

  if (keys.length) targets.push({ row, keys });
}

for (const t of targets) {
  console.log(`   ${t.row.character} | ${t.row.title}`);
  t.keys.forEach((k) => console.log(`      ${k}`));
}
if (missing.length) {
  console.log(`\nℹ️  跳过 ${missing.length} 条：`);
  missing.forEach((x) => console.log(`   - ${x}`));
}
const total = targets.reduce((n, t) => n + t.keys.length, 0);
console.log(`\n📊 待删 ${total} 个对象（${targets.length} 条 mod）`);

if (!isApply) {
  console.log("\n🔍 DRY-RUN：没有删除任何对象。确认无误后加 --apply。");
  process.exit(0);
}

// ==================== 删除 + 复核 ====================

let deleted = 0;
const failed = [];
for (const t of targets) {
  for (const key of t.keys) {
    try {
      await deleteKey(key);
      if (await headKey(key)) failed.push(`${t.row.title}  删除后仍可 HEAD 到：${key}`);
      else deleted++;
    } catch (err) {
      failed.push(`${t.row.title}  ${key}  ${err.message}`);
    }
  }
}

console.log(`\n🗑  已删除 ${deleted} / ${total}`);
if (failed.length) {
  console.error(`❌ 失败 ${failed.length} 条：`);
  failed.forEach((x) => console.error(`   - ${x}`));
  process.exit(1);
}
console.log("✅ 全部孪生图已从 COS 消失（库内仍指向 -blur 键，未改动数据）");
