/**
 * 重新上传「处理过的马赛克预览图」：imagesplitter.tools-mosaic (1)/*-mosaic.webp
 * → 压缩至 750px WebP → 覆盖上传到该 mod 现有 images[0] 的同一 COS key。
 *
 * 用法:
 *   node scripts/reupload-mosaic-images.mjs --dry-run   # 只匹配 + 转 WebP，不上传
 *   node scripts/reupload-mosaic-images.mjs              # 正式覆盖上传
 *
 * 关键点:
 *   1. 文件名 = "{mod名}-mosaic.webp"，注意去掉 "-mosaic" 后缀再按标题匹配数据库。
 *   2. 匹配成功后复用现有 images[0] 的 COS objectKey（URL 不变，站点无需改动）。
 *   3. 若现有图是占位图，则上传到 mods/{slug}/{modId}/preview.webp 并更新数据库。
 *   4. 覆盖上传属于「替换图片」，不新增记录。
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// ==================== 配置 ====================

const MOSAIC_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\wu武器\00\其他\图片\imagesplitter.tools-mosaic (1)`;
const GAME_KEY = "wuthering-waves";

const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

// ==================== Supabase Client ====================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ 缺少 Supabase 环境变量");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ==================== COS Client ====================

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

/** 从已有 URL 提取 COS objectKey；占位图等非本桶 URL 返回 null */
function extractCosKey(imageUrl) {
  if (!imageUrl) return null;
  const prefix = `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/`;
  if (!imageUrl.startsWith(prefix)) return null;
  return imageUrl.slice(prefix.length);
}

function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      { Bucket: cosBucket, Region: cosRegion, Key: objectKey, Body: body, ContentType: contentType },
      (err, data) => {
        if (err) rejectPromise(new Error(`COS 上传失败: ${err.message}`));
        else resolvePromise(data);
      }
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

// ==================== 图片处理 ====================

/** 压缩到 750px 宽 WebP (q80)，与站点预览图约定一致 */
async function convertToWebP(imagePath) {
  const fileBuffer = readFileSync(imagePath);
  const origSize = (fileBuffer.length / 1024).toFixed(1);
  const webpBuffer = await sharp(fileBuffer)
    .resize({ width: 750, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const webpSize = (webpBuffer.length / 1024).toFixed(1);
  const reduction = (((fileBuffer.length - webpBuffer.length) / fileBuffer.length) * 100).toFixed(0);
  return { buffer: webpBuffer, origSizeKB: parseFloat(origSize), webpSizeKB: parseFloat(webpSize), reduction };
}

// ==================== 主流程 ====================

async function main() {
  const startTime = Date.now();

  if (isDryRun) console.log("🔍 DRY-RUN 模式：匹配 + 转 WebP，不实际上传。\n");

  // 1. 扫描 mosaic 文件（去掉 -mosaic 后缀作为 mod 标题）
  const files = readdirSync(MOSAIC_DIR)
    .filter((f) => f.endsWith("-mosaic.webp"))
    .map((f) => ({
      file: f,
      fullPath: join(MOSAIC_DIR, f),
      modTitle: f.replace(/-mosaic\.webp$/i, "").trim(),
    }))
    .sort((a, b) => a.modTitle.localeCompare(b.modTitle, "zh-CN"));

  console.log(`📁 找到 ${files.length} 张 mosaic 图片\n`);

  // 2. 查询库中对应记录（按标题精确匹配）
  const results = [];
  let matched = 0;
  let notFound = 0;

  for (const item of files) {
    const { data, error } = await supabase
      .from("mods")
      .select("id, title, character, images")
      .eq("game_key", GAME_KEY)
      .eq("title", item.modTitle)
      .limit(5);

    if (error) {
      console.error(`❌ 查询失败 ${item.modTitle}: ${error.message}`);
      notFound++;
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`   ⚠️ 未找到记录: ${item.modTitle}`);
      notFound++;
      continue;
    }

    const mod = data[0];
    if (data.length > 1) {
      console.log(`   ⚠️ 标题匹配到多条，取第一条: ${item.modTitle} (${data.length} 条)`);
    }

    matched++;
    results.push({ ...item, mod });
  }

  console.log(`\n✅ 匹配到 ${matched} 条，未找到 ${notFound} 条\n`);

  if (notFound > 0) {
    console.log(`❌ 以下 mod 在库中不存在，请检查:`);
    files.filter((f) => !results.some((r) => r.modTitle === f.modTitle)).forEach((f) => console.log(`   - ${f.modTitle}`));
    if (notFound === files.length) {
      console.log(`\n⚠️ 全部未匹配，中止。`);
      return;
    }
  }

  // 3. 逐张压缩 + 覆盖上传
  let uploaded = 0;
  let updatedDb = 0;

  for (let idx = 0; idx < results.length; idx++) {
    const { fullPath, modTitle, mod } = results[idx];
    const currentImage = mod.images?.[0] || "";
    const currentKey = extractCosKey(currentImage);

    let targetKey;
    // 占位图是共享资源，绝不能覆盖；此时上传新 key 并更新 DB
    if (currentKey && !currentKey.startsWith("placeholder/")) {
      // 已有本桶真实图片 → 覆盖同一 key，URL 不变
      targetKey = currentKey;
    } else {
      // 占位图/无图 → 上传新 key，稍后更新 DB
      targetKey = `mods/${slugify(mod.character)}/${mod.id}/preview.webp`;
    }

    try {
      const { buffer, origSizeKB, webpSizeKB, reduction } = await convertToWebP(fullPath);

      if (isDryRun) {
        console.log(`   [${idx + 1}/${results.length}] 🖼  ${modTitle}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
        console.log(`        → ${targetKey}`);
        continue;
      }

      await uploadToCos(targetKey, buffer, "image/webp");
      uploaded++;

      // 若原先是占位图，需同步更新 DB 图片 URL
      if (!currentKey || currentKey.startsWith("placeholder/")) {
        const { error: updErr } = await supabase
          .from("mods")
          .update({ images: [buildCosUrl(targetKey)] })
          .eq("id", mod.id);
        if (updErr) {
          console.error(`   [${idx + 1}/${results.length}] ⚠️ 上传成功但 DB 更新失败 ${modTitle}: ${updErr.message}`);
        } else {
          updatedDb++;
        }
      }

      console.log(`   [${idx + 1}/${results.length}] ✅ ${modTitle}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
    } catch (err) {
      console.error(`   [${idx + 1}/${results.length}] ❌ ${modTitle}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN 完成：匹配 ${matched} 条，未找到 ${notFound} 条（耗时 ${elapsed}s）`);
    return;
  }

  console.log(`\n📊 完成: 覆盖上传 ${uploaded}/${results.length} 张，更新 DB ${updatedDb} 条（耗时 ${elapsed}s）`);
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
