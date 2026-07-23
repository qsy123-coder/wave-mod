/**
 * 上传爱弥斯 Mod 预览图到 Supabase Storage（文件夹 01-06）
 *
 * 用法: node scripts/upload-aemeath-images-01-06.mjs
 *
 * 前提:
 *   1. .env.local 中已配置 SUPABASE_SERVICE_ROLE_KEY
 *   2. 各文件夹中有与 EXE 同名的图片文件 (.png / .jpg / .webp)
 *
 * 功能:
 *   1. 扫描 01-06 文件夹中的图片文件
 *   2. 按文件名匹配数据库中的 mod 记录
 *   3. 上传图片到 Supabase Storage (mod-assets bucket)
 *   4. 更新 mods 表的 images 字段
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname, basename } from "path";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ==================== 配置 ====================

const BASE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\爱弥斯`;
const SOURCE_FOLDERS = ["01", "02", "03", "04", "05", "06"];
const CHAR_NAME = "爱弥斯";
const STORAGE_BUCKET = "mod-assets";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// ==================== Supabase Client ====================

function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    console.error("❌ 缺少 Supabase 环境变量。请检查 .env.local");
    process.exit(1);
  }
  return { url, serviceRoleKey };
}

const env = getSupabaseEnv();
const supabase = createClient(env.url, env.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`🔗 Supabase URL: ${env.url}`);

// ==================== 文件名匹配 ====================

/**
 * 从图片文件名中提取 title（与 parseFilename 逻辑一致）
 * "爱弥斯-丰汝肥屯 by xxx.png" → "丰汝肥屯 by xxx"
 * "爱弥斯-xx v1.1（切换）.jpg" → "xx v1.1（切换）"
 */
function imageFilenameToTitle(filename) {
  // 去掉扩展名
  let name = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");

  const prefixes = [
    /^爱弥斯（含机甲）[-\s]*/,
    /^爱弥斯[-\s]*/,
    /^爱弥丝[-\s]*/,
  ];

  for (const prefix of prefixes) {
    if (prefix.test(name)) {
      return { title: name.replace(prefix, "").trim(), matched: true };
    }
  }

  // 没匹配到中文前缀，保留原名
  return { title: name, matched: false };
}

/**
 * 扫描文件夹中的图片文件
 * 返回: Map<title, { filePath, ext, originalName }>
 */
function scanImages(folderPath) {
  const images = new Map();

  if (!existsSync(folderPath)) return images;

  const files = readdirSync(folderPath);
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const { title } = imageFilenameToTitle(file);
    images.set(title, {
      filePath: join(folderPath, file),
      ext,
      originalName: file,
    });
  }

  return images;
}

// ==================== 图片上传 ====================

async function uploadImage(filePath, modId, ext) {
  const fileBuffer = readFileSync(filePath);
  const { size } = fileBuffer;

  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const mimeType = mimeMap[ext] || "image/png";

  console.log(`   📤 ${basename(filePath)} (${(size / 1024).toFixed(1)} KB)...`);

  const storagePath = `mods/aemeath/${modId}/preview${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      cacheControl: "31536000",
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    console.error(`   ❌ 上传失败: ${error.message}`);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  console.log(`   ✅ 上传成功`);
  return publicUrlData.publicUrl;
}

// ==================== 主流程 ====================

async function main() {
  console.log("\n🖼️  开始上传爱弥斯 Mod 预览图 (文件夹 01-06)\n");

  // 1. 查询数据库中所有爱弥斯 mod
  console.log("🔍 查询数据库中所有爱弥斯 mod...");
  const { data: allMods, error: queryError } = await supabase
    .from("mods")
    .select("id, title, images")
    .eq("character", CHAR_NAME);

  if (queryError) {
    console.error("❌ 查询失败:", queryError.message);
    process.exit(1);
  }

  console.log(`   数据库中有 ${allMods.length} 个 ${CHAR_NAME} mod`);

  const hasImage = allMods.filter((m) => m.images && m.images.length > 0);
  const noImage = allMods.filter((m) => !m.images || m.images.length === 0);
  console.log(`   已有图片: ${hasImage.length} 个`);
  console.log(`   缺少图片: ${noImage.length} 个\n`);

  // 2. 扫描所有文件夹中的图片
  console.log("📁 扫描文件夹中的图片...");
  const allImages = new Map(); // title → { filePath, ext, originalName, folder }

  for (const folderName of SOURCE_FOLDERS) {
    const folderPath = join(BASE_DIR, folderName);
    const images = scanImages(folderPath);
    console.log(`   ${folderName}: ${images.size} 张图片`);
    for (const [title, info] of images) {
      allImages.set(title, { ...info, folder: folderName });
    }
  }
  console.log(`   总计: ${allImages.size} 张独立图片\n`);

  // 3. 匹配并上传
  console.log("🔗 匹配图片并上传...\n");

  // 构建 DB title → mod 的映射（只处理缺少图片的）
  const modMap = new Map();
  for (const mod of noImage) {
    modMap.set(mod.title, mod);
  }

  let uploaded = 0;
  let matched = 0;
  const unmatchedMods = [];
  const usedImageTitles = new Set();

  for (const [modTitle, mod] of modMap) {
    // 精确匹配
    let imageInfo = allImages.get(modTitle);
    let matchType = "精确";

    // 模糊匹配
    if (!imageInfo) {
      for (const [imgTitle, info] of allImages) {
        if (usedImageTitles.has(imgTitle)) continue;
        // 双向包含匹配（取较长公共子串）
        const minLen = Math.min(modTitle.length, imgTitle.length);
        if (minLen >= 6) {
          const overlap = modTitle.slice(0, minLen - 2);
          if (imgTitle.includes(overlap) || overlap.includes(imgTitle.slice(0, minLen - 2))) {
            imageInfo = info;
            matchType = `模糊: "${imgTitle}"`;
            break;
          }
        }
      }
    }

    if (imageInfo) {
      console.log(`--- [${matchType}] ${modTitle} (${imageInfo.folder}/${imageInfo.originalName}) ---`);

      const imageUrl = await uploadImage(
        imageInfo.filePath,
        mod.id,
        imageInfo.ext
      );

      if (imageUrl) {
        const { error: updateError } = await supabase
          .from("mods")
          .update({ images: [imageUrl] })
          .eq("id", mod.id);

        if (updateError) {
          console.error(`   ❌ 数据库更新失败: ${updateError.message}`);
        } else {
          console.log(`   ✅ 数据库已更新`);
          uploaded++;
        }
      }

      matched++;
      usedImageTitles.add(modTitle);
    } else {
      console.log(`--- ⚠️ ${modTitle} — 无匹配图片`);
      unmatchedMods.push(modTitle);
    }
  }

  // 4. 汇总
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 上传汇总`);
  console.log(`${"=".repeat(60)}`);
  console.log(`   需处理 mod: ${noImage.length} 个`);
  console.log(`   匹配成功: ${matched} 个`);
  console.log(`   上传成功: ${uploaded} 个`);
  console.log(`   无匹配: ${unmatchedMods.length} 个`);

  if (unmatchedMods.length > 0) {
    console.log(`\n⚠️ 缺少图片的 mod:`);
    for (const title of unmatchedMods) {
      console.log(`   - ${title}`);
    }
  }

  // 最终统计
  const { data: finalCheck } = await supabase
    .from("mods")
    .select("id")
    .eq("character", CHAR_NAME)
    .not("images", "eq", "[]");

  const finalWithImages = finalCheck?.length || 0;
  console.log(`\n📊 最终: ${finalWithImages}/${allMods.length} 个 mod 有预览图`);
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
