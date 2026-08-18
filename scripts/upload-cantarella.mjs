/**
 * 上传「坎特蕾拉」角色 Mod：夸克 CSV + 整理文件夹预览图 → 腾讯云 COS + Supabase。
 *
 * 用法:
 *   node scripts/upload-cantarella.mjs --dry-run   # 只解析 + 匹配 + 转 WebP，不上传不入库
 *   node scripts/upload-cantarella.mjs              # 正式上传
 *
 * 数据源:
 *   CSV:  D:\...\wMOD全集-每日更新\坎特蕾拉\分享结果导出-1786880493408.csv  (夸克网盘)
 *   图片: D:\...\wMOD全集-每日更新\整理文件夹\坎特蕾拉\*.png
 *
 * 关键点:
 *   1. CSV 分享名 = "坎特蕾拉-XXX.exe" / "坎特雷拉-XXX.exe"（雷/蕾 拼写差异统一到「坎特蕾拉」）。
 *   2. 去 .exe 后与预览图文件名（去扩展名）精确匹配。
 *   3. 武器前缀（"坎特蕾拉的伞"、"坎特蕾拉专武"）归并到本体角色，title 保留 "的伞"/"专武" 子标识，
 *      与已有「奥古斯塔-的大剑-专武」等约定一致。
 *   4. 无预览图时使用占位图。
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const isDryRun = process.argv.includes("--dry-run");

// ==================== 配置 ====================

const CSV_FILE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\坎特蕾拉\分享结果导出-1786880493408.csv`;
const IMG_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\整理文件夹\坎特蕾拉`;

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

/** 角色前缀 → 标准角色名（"坎特雷拉" 为 "坎特蕾拉" 的拼写变体，统一映射） */
const CHARACTER_PREFIX_MAP = [
  { prefix: "坎特蕾拉", character: "坎特蕾拉" },
  { prefix: "坎特雷拉", character: "坎特蕾拉" },
];

/** 归一化用于去重：去掉尾部 "(1)"/"（1）" 之类的重复序号 */
function normalizeDup(value) {
  return value.replace(/[（(]\d+[)）]\s*$/, "").trim();
}

/** 解析角色 + title（去掉角色名前缀，保留 的伞/专武 等子标识） */
function resolveCharacterAndTitle(key) {
  for (const { prefix, character } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title = key.slice(prefix.length);
      title = title.replace(/^[-－]\s*/, "").trim();
      if (!title) title = key;
      return { character, title };
    }
  }
  const dash = key.indexOf("-");
  const fallbackChar = dash === -1 ? key : key.slice(0, dash);
  return { character: fallbackChar, title: key };
}

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

// ==================== CSV 解析（夸克，含多行引号字段） ====================

function parseQuarkCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = [];
  let i = 0;
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.startsWith("创建分享状态")) i = 1;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const firstComma = line.indexOf(",");
    if (firstComma === -1) { i++; continue; }
    let rest = line.slice(firstComma + 1);

    let shareName;
    if (rest.startsWith('"')) {
      const endQuote = rest.indexOf('",', 1);
      if (endQuote === -1) { i++; continue; }
      shareName = rest.slice(1, endQuote);
      rest = rest.slice(endQuote + 2);
    } else {
      const nextComma = rest.indexOf(",");
      if (nextComma === -1) { i++; continue; }
      shareName = rest.slice(0, nextComma);
      rest = rest.slice(nextComma + 1);
    }

    let shareContent = "";
    if (rest.startsWith('"')) {
      rest = rest.slice(1);
      const contentLines = [];
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
    const urlMatch = shareContent.match(/https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?pwd=[^&\s]+)?/);
    const url = urlMatch ? urlMatch[0] : "";
    const filename = shareName.trim();
    const key = filename.replace(/\.exe$/i, "");
    if (key && url) records.push({ key, filename, url, code: extractCode });
    i++;
  }
  return records;
}

// ==================== 图片索引 ====================

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function buildImageIndex(dir) {
  const map = new Map();
  if (!existsSync(dir)) return map;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return map; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = basename(e.name, ext);
    if (!map.has(base)) map.set(base, full);
  }
  return map;
}

// ==================== 图片转换 ====================

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
  if (isDryRun) console.log("🔍 DRY-RUN 模式：解析 + 匹配 + 转 WebP，不实际上传/入库。\n");

  // 1. 解析 CSV
  const allRecords = parseQuarkCsv(CSV_FILE);
  const seen = new Set();
  const unique = [];
  for (const r of allRecords) {
    const k = r.key + "|" + r.url;
    if (!seen.has(k)) { seen.add(k); unique.push(r); }
  }
  console.log(`📋 CSV 记录 ${allRecords.length} 条，去重后 ${unique.length} 条`);

  // 2. 图片索引
  const imageMap = buildImageIndex(IMG_DIR);
  console.log(`🖼  图片索引: ${imageMap.size} 张`);

  // 3. 查询现有记录去重（坎特蕾拉当前应为空）
  const { data: existing, error: existingErr } = await supabase
    .from("mods")
    .select("title, character")
    .eq("game_key", GAME_KEY)
    .in("character", ["坎特蕾拉"]);
  if (existingErr) {
    console.error("❌ 查询现有记录失败:", existingErr.message);
    process.exit(1);
  }
  const existingSet = new Set(existing.map((m) => `${m.character}|${normalizeDup(m.title ?? "")}`));
  console.log(`🗄  现有「坎特蕾拉」记录: ${existingSet.size} 条`);

  // 4. 逐条处理
  const results = [];
  let matchedImage = 0;
  let placeholder = 0;
  let skipDup = 0;
  const placeholderKeys = [];

  for (const record of unique) {
    const { character, title } = resolveCharacterAndTitle(record.key);

    if (existingSet.has(`${character}|${normalizeDup(title)}`)) {
      skipDup++;
      continue;
    }

    const modId = randomUUID();

    const versionMatch = title.match(/v(\d+[\d.]*)/i);
    const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

    let imagePath = imageMap.get(record.key) || null;
    if (!imagePath) {
      const deduped = normalizeDup(record.key);
      if (deduped !== record.key) imagePath = imageMap.get(deduped) || null;
    }
    let imageUrl;

    if (!imagePath) {
      imageUrl = PLACEHOLDER_IMAGE_URL;
      placeholder++;
      placeholderKeys.push(`${character} | ${title}`);
    } else {
      matchedImage++;
      try {
        const { buffer, origSizeKB, webpSizeKB, reduction } = await convertToWebP(imagePath);
        const objectKey = `mods/${slugify(character)}/${modId}/preview.webp`;
        if (isDryRun) {
          imageUrl = buildCosUrl(objectKey);
        } else {
          await uploadToCos(objectKey, buffer, "image/webp");
          imageUrl = buildCosUrl(objectKey);
        }
        if (isDryRun) {
          console.log(`   🖼  ${title}  (${origSizeKB}KB → ${webpSizeKB}KB WebP, -${reduction}%)`);
        }
      } catch (err) {
        console.error(`   ❌ ${record.key}: ${err.message}`);
        imageUrl = PLACEHOLDER_IMAGE_URL;
        placeholderKeys.push(`${character} | ${title}`);
        placeholder++;
      }
    }

    results.push({
      id: modId,
      title,
      character,
      game_key: GAME_KEY,
      game_version: GAME_VERSION,
      version,
      description: `${character} ${title} MOD，夸克网盘下载。`,
      download_url: null,
      drive_links: [{ platform: "夸克网盘", url: record.url }],
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

  console.log(`\n✅ 匹配预览图: ${matchedImage}，占位图: ${placeholder}，去重跳过: ${skipDup}`);
  if (placeholderKeys.length) {
    console.log(`\n⚠️  以下记录使用占位图（未匹配到预览图）:`);
    placeholderKeys.forEach((k) => console.log(`   - ${k}`));
  }

  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN: 跳过入库，共 ${results.length} 条记录`);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱ 耗时 ${elapsed}s`);
    return;
  }

  console.log(`\n💾 批量写入数据库 (${results.length} 条)...`);
  const BATCH_SIZE = 50;
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(results.length / BATCH_SIZE);
    const { data, error } = await supabase.from("mods").insert(batch).select("id, title");
    if (error) {
      console.error(`   ❌ 批次 ${batchNum}/${totalBatches} 失败: ${error.message}`);
      failed += batch.length;
      continue;
    }
    inserted += data.length;
    console.log(`   ✅ 批次 ${batchNum}/${totalBatches}: ${data.length} 条`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n📊 完成: 成功 ${inserted} 条, 失败 ${failed} 条 (耗时 ${elapsed} 分钟)`);
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
