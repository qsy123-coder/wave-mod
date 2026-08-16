/**
 * 上传「男漂_缺图」里补的预览图，替换对应 mod 的占位图。
 *
 * 数据源: D:\...\wMOD全集-每日更新\男漂_缺图\*.png（与同名 .exe 对应）
 * 流程: .png 文件名(去扩展名) → 反解出 title → 匹配 DB 中 character='男漂' 的占位图 mod
 *       → 转 WebP 上传 COS → 更新 mod.images[0] 为 COS URL。
 *
 * 用法:
 *   node scripts/upload-nanpiao-missing-images.mjs --dry-run   # 只匹配，不上传
 *   node scripts/upload-nanpiao-missing-images.mjs              # 正式上传入库
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const PNG_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\男漂_缺图`;
const PLACEHOLDER =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const isDryRun = process.argv.includes("--dry-run");

// ==================== Supabase ====================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ==================== COS ====================
const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!cosSecretId || !cosSecretKey || !cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS 环境变量");
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
      (err, data) => (err ? rejectPromise(new Error(err.message)) : resolvePromise(data))
    );
  });
}
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
  const webpBuffer = await sharp(readFileSync(imagePath))
    .resize({ width: 750, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return webpBuffer;
}

// ==================== 列出 png ====================
function listPngFiles(dir) {
  const result = [];
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase().endsWith(".png")) result.push(full);
  }
  return result;
}

const pngFiles = listPngFiles(PNG_DIR);
const pngKeyMap = new Map(); // basename(去.png) -> fullpath
for (const f of pngFiles) pngKeyMap.set(basename(f, extname(f)), f);
console.log(`男漂_缺图 .png 文件数: ${pngFiles.length}\n`);

// ==================== 查询占位图 mod ====================
const { data: mods, error } = await supabase
  .from("mods")
  .select("id, title, images")
  .eq("game_key", "wuthering-waves")
  .eq("character", "男漂");
if (error) { console.error("查询失败:", error.message); process.exit(1); }

const placeholderMods = mods.filter((m) => !m.images?.[0] || m.images[0] === PLACEHOLDER);
console.log(`男漂 占位图 mod: ${placeholderMods.length} 个\n`);

// ==================== 匹配 ====================
function candidateKeys(title) {
  const keys = [];
  for (const prefix of ["男漂", "男主"]) {
    for (const sep of ["-", "－", " ", ""]) keys.push(prefix + sep + title);
  }
  return keys;
}

const matched = [];
const unmatched = [];
for (const m of placeholderMods) {
  const title = (m.title ?? "").trim();
  let png = null;
  for (const k of candidateKeys(title)) {
    if (pngKeyMap.has(k)) { png = pngKeyMap.get(k); break; }
  }
  if (png) matched.push({ mod: m, title, png });
  else unmatched.push(title);
}

console.log(`=== 匹配结果 ===`);
console.log(`匹配到 png: ${matched.length}，未匹配: ${unmatched.length}\n`);
if (unmatched.length) {
  console.log("--- 未匹配（无 png） ---");
  unmatched.forEach((t) => console.log(`  ${t}`));
  console.log("");
}

// ==================== dry-run ====================
if (isDryRun) {
  console.log("--- 将上传的 png（映射到 title） ---");
  matched.forEach((x) => console.log(`  [${x.title}] <- ${basename(x.png)}`));
  console.log(`\n🔍 DRY-RUN: 未上传。将处理 ${matched.length} 张图。`);
  process.exit(0);
}

// ==================== 上传 + 更新 DB ====================
let uploaded = 0;
let failed = 0;
for (const { mod, title, png } of matched) {
  try {
    const webp = await convertToWebP(png);
    const objectKey = `mods/${slugify("男漂")}/${mod.id}/preview.webp`;
    await uploadToCos(objectKey, webp, "image/webp");
    const imageUrl = buildCosUrl(objectKey);
    const { error: updErr } = await supabase
      .from("mods")
      .update({ images: [imageUrl] })
      .eq("id", mod.id);
    if (updErr) throw new Error(`DB 更新失败: ${updErr.message}`);
    uploaded++;
    console.log(`✅ [${title}] -> ${imageUrl}`);
  } catch (err) {
    failed++;
    console.error(`❌ [${title}] ${err.message}`);
  }
}

console.log(`\n📊 完成: 成功 ${uploaded}，失败 ${failed}`);
