/**
 * 上传「wu武器/00/fouth」UI 类批量 Mod：夸克 CSV + 图片目录预览图 → 腾讯云 COS + Supabase。
 *
 * 用法:
 *   node scripts/upload-ui-batch.mjs --dry-run   # 只解析 + 匹配 + 转 WebP，不上传不入库
 *   node scripts/upload-ui-batch.mjs              # 正式上传
 *
 * 数据源:
 *   CSV:  D:\...\wMOD全集-每日更新\wu武器\00\fouth\分享结果导出-1787010208229.csv  (夸克网盘，UI 类)
 *   图片: D:\...\wMOD全集-每日更新\wu武器\00\其他\图片\*.png
 *
 * 关键点:
 *   1. CSV 分享名 = mod 名（去 .exe）与预览图文件名（去扩展名）精确匹配。
 *   2. 分类: 爱弥斯/绯雪 前缀 → 归到对应角色（title 去前缀）；
 *      其余 UI mod（全ui/编队/加载/背包界面/索拉指南等）→ character = "UI"（title 保留全名）。
 *   3. 去重: 按 (character, title) 与现有库比对，已存在则跳过（如科考摩托、品味兔女郎）。
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

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// ==================== 配置 ====================

const CSV_FILE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\wu武器\00\fouth\分享结果导出-1787010208229.csv`;
const IMG_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\wu武器\00\其他\图片`;

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

/** 角色前缀 → 标准角色名（title 去前缀）。其余 mod 归入 "UI" 分类。 */
const CHARACTER_PREFIX_MAP = [
  { prefix: "爱弥斯", character: "爱弥斯" },
  { prefix: "绯雪", character: "绯雪" },
];

const UI_CATEGORY = "UI";

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

// ==================== 分类解析 ====================

/** 解析角色 + title：爱弥斯/绯雪 前缀 → 对应角色去前缀；其余 → "UI" 保留全名 */
function resolveCharacterAndTitle(key) {
  for (const { prefix, character } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title = key.slice(prefix.length);
      // 去掉紧随其后的分隔符 "-"/"－"
      title = title.replace(/^[-－]\s*/, "").trim();
      if (!title) title = key;
      return { character, title };
    }
  }
  return { character: UI_CATEGORY, title: key };
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

  if (!existsSync(CSV_FILE)) {
    console.error(`❌ CSV 不存在: ${CSV_FILE}`);
    process.exit(1);
  }

  // 1. 解析 CSV
  const records = parseQuarkCsv(CSV_FILE);
  console.log(`📋 CSV 记录: ${records.length} 条`);

  // 2. 图片索引
  const imageMap = buildImageIndex(IMG_DIR);
  console.log(`🖼  图片索引: ${imageMap.size} 张`);

  // 3. 查询现有记录用于去重（分页拉全）
  const existing = [];
  const PAGE_SIZE = 1000;
  let pageFrom = 0;
  while (true) {
    const { data, error: existingErr } = await supabase
      .from("mods")
      .select("title, character")
      .eq("game_key", GAME_KEY)
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);
    if (existingErr) {
      console.error("❌ 查询现有记录失败:", existingErr.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    existing.push(...data);
    if (data.length < PAGE_SIZE) break;
    pageFrom += PAGE_SIZE;
  }
  const existingSet = new Set(existing.map((m) => `${m.character}|${(m.title ?? "").trim()}`));
  // 标题级去重集（与角色无关）：科考摩托等已在其他角色分类下存在时也能跳过
  const existingTitles = new Set(existing.map((m) => (m.title ?? "").trim()));
  console.log(`🗄  现有记录去重集: ${existingSet.size} 条（分页拉取 ${existing.length} 条）`);

  // 4. 逐条处理
  const results = [];
  let matchedImage = 0;
  let placeholder = 0;
  let skipDup = 0;
  const charCount = {};
  const placeholderKeys = [];
  const skipDupKeys = [];

  for (let idx = 0; idx < records.length; idx++) {
    const record = records[idx];
    const { character, title } = resolveCharacterAndTitle(record.key);

    // 去重：已存在则跳过（按 (角色, title) 或任意角色下的同名 title）
    if (existingSet.has(`${character}|${title}`) || existingTitles.has(record.key) || existingTitles.has(title)) {
      skipDup++;
      skipDupKeys.push(`${character} | ${title}`);
      continue;
    }

    const modId = randomUUID();

    // 版本号提取
    const versionMatch = title.match(/v(\d+[\d.]*)/i);
    const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

    // 预览图（按文件名精确匹配）
    let imagePath = imageMap.get(record.key) || null;
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
          console.log(`   [${idx + 1}/${records.length}] 🖼  ${character} | ${title}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
        } else {
          await uploadToCos(objectKey, buffer, "image/webp");
          imageUrl = buildCosUrl(objectKey);
          console.log(`   [${idx + 1}/${records.length}] ✅ ${character} | ${title}`);
        }
      } catch (err) {
        console.error(`   [${idx + 1}/${records.length}] ❌ ${record.key}: ${err.message}`);
        imageUrl = PLACEHOLDER_IMAGE_URL;
        placeholder++;
        placeholderKeys.push(`${character} | ${title}`);
      }
    }

    if (!charCount[character]) charCount[character] = 0;
    charCount[character]++;

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

  if (skipDupKeys.length) {
    console.log(`\n⏭️  已存在跳过:`);
    skipDupKeys.forEach((k) => console.log(`   - ${k}`));
  }

  // 5. 按角色汇总
  console.log(`\n=== 按角色汇总 (待上传 ${results.length} 条) ===`);
  const charRows = Object.entries(charCount).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of charRows) console.log(`   ${c.padEnd(16)} ${n}`);

  if (placeholderKeys.length) {
    console.log(`\n⚠️  以下记录使用占位图（未匹配到预览图）:`);
    placeholderKeys.forEach((k) => console.log(`   - ${k}`));
  }

  // 6. 入库
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
