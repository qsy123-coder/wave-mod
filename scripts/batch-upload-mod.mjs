/**
 * 批量上传 Mod 到 Supabase + 腾讯云 COS
 *
 * 用法: node scripts/batch-upload-mod.mjs [--dry-run]
 *
 * 前提:
 *   1. .env.local 中已配置 SUPABASE_SERVICE_ROLE_KEY
 *   2. .env.local 中已配置 COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION
 *   3. 源文件夹结构:
 *      {角色名}/
 *        ├── 分享结果导出-*.csv (夸克网盘)
 *        └── {子目录}/
 *            ├── {mod名称}.exe
 *            └── {mod名称}.png/.jpg (预览图)
 *
 * 功能:
 *   1. 解析夸克网盘 CSV，提取 mod 列表
 *   2. 在子目录中查找匹配的预览图
 *   3. 将预览图转为 WebP (750px, 80% quality)
 *   4. 上传 WebP 到腾讯云 COS
 *   5. 批量插入 mods 表
 *   6. 无预览图时使用占位图
 *   7. 不上传 .exe 文件
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

// Load env
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// ==================== 配置 ====================

const BASE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新`;

const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const GAME_KEY = "wuthering-waves";
const GAME_VERSION = "未标注";
const DEFAULT_VERSION = "未标注";

const XXMI_GUIDE = [
  "1. 下载并解压对应 MOD 压缩包。",
  "2. 打开 XXMI Launcher，确认当前游戏版本与 MOD 版本匹配。",
  "3. 将 MOD 文件夹复制到 XXMI Mods 目录。",
  "4. 返回启动器启用对应角色模组后进入游戏检查效果。",
].join("\n");

// ==================== Supabase Client ====================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ 缺少 Supabase 环境变量。请检查 .env.local");
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
  console.error("❌ 缺少 COS 环境变量。需要 COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION。");
  process.exit(1);
}

const cos = new COS({
  SecretId: cosSecretId,
  SecretKey: cosSecretKey,
});

function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      },
      (err, data) => {
        if (err) reject(new Error(`COS 上传失败: ${err.message}`));
        else resolve(data);
      }
    );
  });
}

// ==================== 字符 slug 化 ====================

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "mod";
}

// ==================== CSV 解析 ====================

/**
 * 解析夸克网盘 CSV（含多行引号字段）
 * 列: 创建分享状态,分享名,分享地址(多行),提取码,分享时间
 */
function parseQuarkCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = [];
  let i = 0;
  const lines = raw.split(/\r?\n/);

  if (lines[0]?.startsWith("创建分享状态")) {
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    const firstComma = line.indexOf(",");
    if (firstComma === -1) {
      i++;
      continue;
    }

    let rest = line.slice(firstComma + 1);

    // 分享名（可能在引号中也可能没有）
    let shareName;
    if (rest.startsWith('"')) {
      const endQuote = rest.indexOf('",', 1);
      if (endQuote === -1) {
        i++;
        continue;
      }
      shareName = rest.slice(1, endQuote);
      rest = rest.slice(endQuote + 2);
    } else {
      const nextComma = rest.indexOf(",");
      if (nextComma === -1) {
        i++;
        continue;
      }
      shareName = rest.slice(0, nextComma);
      rest = rest.slice(nextComma + 1);
    }

    // 分享地址 — 可能是多行引号字段
    let shareContent = "";
    if (rest.startsWith('"')) {
      rest = rest.slice(1);
      let contentLines = [];
      while (i < lines.length) {
        const cl = rest;
        const endIdx = cl.indexOf('",');
        if (endIdx !== -1) {
          contentLines.push(cl.slice(0, endIdx));
          rest = cl.slice(endIdx + 2);
          break;
        }
        if (cl.endsWith('"')) {
          contentLines.push(cl.slice(0, -1));
          i++;
          rest = lines[i]?.trim() || "";
          break;
        }
        contentLines.push(cl);
        i++;
        if (i >= lines.length) break;
        rest = lines[i];
      }
      shareContent = contentLines.join("\n");
    } else {
      const nextComma = rest.indexOf(",");
      if (nextComma !== -1) {
        shareContent = rest.slice(0, nextComma);
        rest = rest.slice(nextComma + 1);
      } else {
        shareContent = rest;
        rest = "";
      }
    }

    const remainingParts = rest.split(",");
    const extractCode = remainingParts[0]?.trim() || "";

    const urlMatch = shareContent.match(
      /https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?pwd=[^&\s]+)?/
    );
    const url = urlMatch ? urlMatch[0] : "";

    const filename = shareName.trim();
    const key = filename.replace(/\.exe$/i, "");

    if (key && url) {
      records.push({ key, filename, url, code: extractCode });
    }

    i++;
  }

  return records;
}

// ==================== 文件查找 ====================

/**
 * 递归扫描目录下所有图片文件，返回 { basename -> fullPath } 映射
 * 只收集图片（png/jpg/jpeg/webp/gif），.exe 等不收集
 */
function scanAllImages(dirPath) {
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
  const fileMap = new Map();
  function walk(dir) {
    if (!existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const ext = extname(e.name).toLowerCase();
        if (!imageExts.has(ext)) continue;
        const base = basename(e.name, ext);
        // Prefer exact match; if already exists, keep first found
        if (!fileMap.has(base)) {
          fileMap.set(base, full);
        }
      }
    }
  }
  walk(dirPath);
  return fileMap;
}

/**
 * 查找与 mod key 匹配的预览图路径
 */
function findPreviewImage(modKey, imageMap) {
  // Direct match
  if (imageMap.has(modKey)) {
    return imageMap.get(modKey);
  }
  // Try variations (normalize spaces)
  const trimmed = modKey.trim();
  if (trimmed !== modKey && imageMap.has(trimmed)) {
    return imageMap.get(trimmed);
  }
  return null;
}

// ==================== 图片处理 ====================

/**
 * 将预览图转为 WebP: 750px 宽, 80% 质量
 */
async function convertToWebP(imagePath) {
  const fileBuffer = readFileSync(imagePath);
  const origSize = (fileBuffer.length / 1024).toFixed(1);

  const webpBuffer = await sharp(fileBuffer)
    .resize({ width: 750, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const webpSize = (webpBuffer.length / 1024).toFixed(1);
  const reduction = (
    ((fileBuffer.length - webpBuffer.length) / fileBuffer.length) *
    100
  ).toFixed(0);

  return {
    buffer: webpBuffer,
    origSizeKB: parseFloat(origSize),
    webpSizeKB: parseFloat(webpSize),
    reduction,
  };
}

// ==================== 文件名解析 ====================

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从文件名提取 mod title（去掉角色名前缀）
 */
function parseFilename(filename, charName) {
  let name = filename.replace(/\.exe$/i, "");

  // 角色名前缀匹配: "角色名-" or "角色名（含XXX）-"
  const prefixes = [
    new RegExp(`^${escapeRegExp(charName)}（[^）]*）[-\\s]*`),
    new RegExp(`^${escapeRegExp(charName)}[-\\s]*`),
  ];

  for (const prefix of prefixes) {
    if (prefix.test(name)) {
      name = name.replace(prefix, "").trim();
      break;
    }
  }

  // 提取版本号
  const versionMatch = name.match(/v(\d+[\d.]*)/i);
  const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

  return { title: name || filename.replace(/\.exe$/i, ""), version };
}

// ==================== 主流程 ====================

async function processCharacter(charName) {
  const charDir = join(BASE_DIR, charName);
  if (!existsSync(charDir)) {
    console.log(`   ⚠️ 目录不存在，跳过: ${charName}`);
    return { results: [], stats: { total: 0, uploaded: 0, noImage: 0 } };
  }

  // 1. 查找 CSV 文件（在根目录）
  const csvFiles = readdirSync(charDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.startsWith("分享结果导出-") && f.name.endsWith(".csv"))
    .map((f) => join(charDir, f.name));

  if (csvFiles.length === 0) {
    console.log(`   ⚠️ 无 CSV 文件，跳过`);
    return { results: [], stats: { total: 0, uploaded: 0, noImage: 0 } };
  }

  // 2. 解析所有 CSV
  let allRecords = [];
  const seenKeys = new Set();
  for (const csv of csvFiles) {
    const records = parseQuarkCsv(csv);
    for (const r of records) {
      if (!seenKeys.has(r.key)) {
        seenKeys.add(r.key);
        allRecords.push(r);
      }
    }
  }

  console.log(`   📋 CSV 解析: ${allRecords.length} 个唯一 mod（${csvFiles.length} 个 CSV 文件）`);

  if (allRecords.length === 0) {
    return { results: [], stats: { total: 0, uploaded: 0, noImage: 0 } };
  }

  // 3. 扫描所有子目录中的图片
  const imageMap = scanAllImages(charDir);
  console.log(`   📁 扫描到 ${imageMap.size} 张图片`);

  // 4. 逐 mod 处理
  const results = [];
  let uploaded = 0;
  let noImage = 0;
  const storageKey = slugify(charName);

  for (let idx = 0; idx < allRecords.length; idx++) {
    const record = allRecords[idx];
    const modId = randomUUID();

    // 查找预览图
    const imagePath = findPreviewImage(record.key, imageMap);
    let imageUrl;

    if (!imagePath) {
      // 使用占位图
      imageUrl = PLACEHOLDER_IMAGE_URL;
      noImage++;
      console.log(`   [${idx + 1}/${allRecords.length}] ⚠️ ${record.key} → 占位图`);
    } else {
      // 转换并上传
      try {
        const { buffer: webpBuffer, origSizeKB, webpSizeKB, reduction } =
          await convertToWebP(imagePath);

        const objectKey = `mods/${storageKey}/${modId}/preview.webp`;

        if (isDryRun) {
          imageUrl = buildCosUrl(objectKey);
          console.log(
            `   [${idx + 1}/${allRecords.length}] 🔍 ${record.key} | ${origSizeKB}KB → ${webpSizeKB}KB WebP (${reduction}%)`
          );
        } else {
          await uploadToCos(objectKey, webpBuffer, "image/webp");
          imageUrl = buildCosUrl(objectKey);
          console.log(
            `   [${idx + 1}/${allRecords.length}] ✅ ${record.key} | ${origSizeKB}KB → ${webpSizeKB}KB WebP (减小${reduction}%)`
          );
        }
        uploaded++;
      } catch (err) {
        console.error(`   [${idx + 1}/${allRecords.length}] ❌ ${record.key}: ${err.message}`);
        // 上传失败使用占位图
        imageUrl = PLACEHOLDER_IMAGE_URL;
      }
    }

    // 解析 mod 标题和版本
    const { title, version } = parseFilename(record.filename, charName);

    const description = `${charName} ${title} MOD，夸克网盘下载。`;

    // 构建 drive_links
    const driveLinks = [
      {
        platform: "夸克网盘",
        url: record.url,
      },
    ];

    results.push({
      id: modId,
      title,
      character: charName,
      game_key: GAME_KEY,
      game_version: GAME_VERSION,
      version,
      description,
      download_url: null,
      drive_links: driveLinks,
      nsfw: false,
      is_published: true,
      is_available: true,
      images: [imageUrl],
      xxmi_install_guide: XXMI_GUIDE,
      mod_author_url: null,
      video_url: null,
      created_by: null,
    });
  }

  console.log(
    `\n   📊 ${charName}: 总数 ${allRecords.length}, 上传预览图 ${uploaded}, 占位图 ${noImage}`
  );

  return {
    results,
    stats: { total: allRecords.length, uploaded, noImage },
  };
}

// ==================== 批量插入 ====================

async function insertBatch(results) {
  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN: 跳过数据库插入，共 ${results.length} 条记录`);
    return 0;
  }

  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(results.length / BATCH_SIZE);
    console.log(
      `   📤 批次 ${batchNum}/${totalBatches}: ${batch.length} 条...`
    );

    const { data, error } = await supabase
      .from("mods")
      .insert(batch)
      .select("id, title");

    if (error) {
      console.error(`   ❌ 批次插入失败: ${error.message}`);
      console.error(`   Details: ${JSON.stringify(error)}`);
      continue;
    }

    inserted += data.length;
    console.log(`   ✅ 成功 ${data.length} 条`);
  }

  return inserted;
}

// ==================== 入口 ====================

async function main() {
  const startTime = Date.now();

  if (isDryRun) {
    console.log("🔍 DRY-RUN 模式：预览并转 WebP，不实际上传。\n");
  }

  // 获取所有有 CSV 的角色文件夹
  const folders = readdirSync(BASE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  // 筛选有 CSV 文件的角色
  const allChars = [];
  for (const name of folders) {
    const charDir = join(BASE_DIR, name);
    const hasCsv = readdirSync(charDir).some(
      (f) => f.startsWith("分享结果导出-") && f.endsWith(".csv")
    );
    if (hasCsv) {
      allChars.push(name);
    }
  }

  console.log(`🎮 共 ${allChars.length} 个角色有 CSV 文件\n`);
  console.log(`${"=".repeat(60)}`);

  let allResults = [];
  const summary = [];

  for (let ci = 0; ci < allChars.length; ci++) {
    const charName = allChars[ci];
    console.log(`\n${"#".repeat(60)}`);
    console.log(`🎮 [${ci + 1}/${allChars.length}] 角色: ${charName}`);
    console.log(`${"#".repeat(60)}`);

    const { results, stats } = await processCharacter(charName);
    if (results.length > 0) {
      allResults = allResults.concat(results);
      summary.push({ char: charName, ...stats });
    }
  }

  // ==================== 汇总 ====================

  console.log(`\n\n${"=".repeat(60)}`);
  console.log(`📊 所有角色处理完成`);
  console.log(`${"=".repeat(60)}`);

  console.log(`\n   按角色汇总:`);
  let grandTotal = 0;
  let grandUploaded = 0;
  let grandNoImage = 0;
  for (const s of summary) {
    console.log(`   ${s.char}: 总数 ${s.total}, 预览图 ${s.uploaded}, 占位图 ${s.noImage}`);
    grandTotal += s.total;
    grandUploaded += s.uploaded;
    grandNoImage += s.noImage;
  }
  console.log(
    `\n   总计: ${grandTotal} 个 mod | 预览图: ${grandUploaded} | 占位图: ${grandNoImage}`
  );

  // ==================== 入库 ====================

  if (allResults.length > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`💾 批量写入数据库 (${allResults.length} 条)...`);
    console.log(`${"=".repeat(60)}`);
    const inserted = await insertBatch(allResults);
    console.log(`\n   写入成功: ${inserted}/${allResults.length}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n⏱ 耗时: ${elapsed} 分钟`);
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
