/**
 * 批量上传多个角色 Mod 到 Supabase
 *
 * 用法: node scripts/batch-upload-multi-char.mjs
 *
 * 前提:
 *   1. .env.local 中已配置 SUPABASE_SERVICE_ROLE_KEY
 *   2. 源文件夹结构: {角色名}/{子目录}/ 下包含:
 *      - 批量分享记录_*.csv (百度网盘)
 *      - 分享结果导出-*.csv (夸克网盘)
 *      - {mod名称}.exe (Mod 安装包)
 *      - {mod名称}.jpg 或 .png (预览图)
 *
 * 功能:
 *   1. 解析百度网盘 CSV + 夸克网盘 CSV，按文件名匹配
 *   2. 查找匹配的 .exe 文件和预览图
 *   3. 上传预览图到 Supabase Storage
 *   4. 批量插入 mods 表
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, basename, extname } from "path";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { resolve } from "path";
import sharp from "sharp";

// 先加载 .env，再加载 .env.local — .env.local 优先（覆盖模式）
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ==================== 配置 ====================

const BASE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新`;

/** 角色配置列表 */
const CHARACTER_CONFIGS = [
  {
    name: "弗洛洛",
    storage_key: "fuluoluo",
    subdirs: ["00", "01", "02"],
    game_key: "wuthering-waves",
  },
  {
    name: "洛瑟菈",
    storage_key: "luosela",
    subdirs: ["00"],
    game_key: "wuthering-waves",
  },
  {
    name: "卡提希娅",
    storage_key: "katixiya",
    subdirs: ["00", "01", "02", "03"],
    game_key: "wuthering-waves",
  },
  {
    name: "椿",
    storage_key: "chun",
    subdirs: ["00", "01", "02"],
    game_key: "wuthering-waves",
  },
  {
    name: "绯雪",
    storage_key: "feixue",
    subdirs: ["01", "02", "03", "04", "05"], // 跳过 06
    game_key: "wuthering-waves",
  },
];

const GAME_VERSION = "未标注";
const DEFAULT_VERSION = "未标注";
const STORAGE_BUCKET = "mod-assets";

const XXMI_GUIDE = [
  "1. 下载并解压对应 MOD 压缩包。",
  "2. 打开 XXMI Launcher，确认当前游戏版本与 MOD 版本匹配。",
  "3. 将 MOD 文件夹复制到 XXMI Mods 目录。",
  "4. 返回启动器启用对应角色模组后进入游戏检查效果。",
].join("\n");

// ==================== Supabase Client ====================

function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    console.error("❌ 缺少 Supabase 环境变量。请检查 .env.local");
    console.error(`   NEXT_PUBLIC_SUPABASE_URL=${url || "(空)"}`);
    console.error(
      `   SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey ? "***已设置***" : "(空)"}`
    );
    process.exit(1);
  }

  return { url, serviceRoleKey };
}

const env = getSupabaseEnv();
const supabase = createClient(env.url, env.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`🔗 Supabase URL: ${env.url}`);
console.log(`🔑 Service Role Key: ${env.serviceRoleKey.slice(0, 20)}...`);

// ==================== CSV 解析 ====================

/**
 * 解析百度网盘 CSV（简单逗号分隔，无多行字段）
 * 列: 文件名,链接,提取码,分享时间,分享状态
 */
function parseBaiduCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.trim().split(/\r?\n/);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length >= 3) {
      const filename = parts[0].trim();
      const url = parts[1].trim();
      const code = parts[2]?.trim() || "";
      const key = filename.replace(/\.exe$/i, "");
      records.push({ key, filename, url, code, platform: "百度网盘" });
    }
  }
  return records;
}

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
      records.push({
        key,
        filename,
        url,
        code: extractCode,
        platform: "夸克网盘",
      });
    }

    i++;
  }

  return records;
}

/**
 * 在目录中查找 CSV 文件
 * @returns {{ baidu: string|null, quark: string|null }}
 */
function findCsvFiles(dirPath) {
  const files = readdirSync(dirPath, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".csv"))
    .map((f) => f.name);

  const baidu = files.find((f) => f.startsWith("批量分享记录_")) || null;
  const quark = files.find((f) => f.startsWith("分享结果导出-")) || null;

  return {
    baidu: baidu ? join(dirPath, baidu) : null,
    quark: quark ? join(dirPath, quark) : null,
  };
}

// ==================== 文件名解析 ====================

/**
 * 构建角色名正则前缀列表
 * 匹配 "角色名-" "角色名-" 等前缀
 */
function buildPrefixPatterns(charName) {
  return [
    // "角色名（含XXX）-"
    new RegExp(`^${escapeRegExp(charName)}（[^）]*）[-\\s]*`),
    // "角色名-"
    new RegExp(`^${escapeRegExp(charName)}[-\\s]*`),
  ];
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从文件名提取 mod title 和 version
 */
function parseFilename(filename, charName) {
  let name = filename.replace(/\.exe$/i, "");

  const prefixes = buildPrefixPatterns(charName);

  let title = name;
  for (const prefix of prefixes) {
    if (prefix.test(name)) {
      title = name.replace(prefix, "").trim();
      break;
    }
  }

  // 提取版本号
  const versionMatch = title.match(/v(\d+[\d.]*)/i);
  const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

  return { title: title || name, version };
}

// ==================== 图片上传 ====================

/**
 * 将预览图转换为 WebP 并上传到 Supabase Storage
 * 规则: 批量上传前必须统一转为 WebP（750px 宽, 80% 质量）
 * @returns publicUrl 或 null
 */
async function uploadPreviewImage(imagePath, storageKey, modId) {
  const fileBuffer = readFileSync(imagePath);
  const origSize = (fileBuffer.length / 1024).toFixed(1);

  // 转为 WebP: 750px 宽, 80% 质量
  const webpBuffer = await sharp(fileBuffer)
    .resize({ width: 750, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const webpSize = (webpBuffer.length / 1024).toFixed(1);
  const reduction = (
    ((fileBuffer.length - webpBuffer.length) / fileBuffer.length) *
    100
  ).toFixed(0);

  const storagePath = `mods/${storageKey}/${modId}/preview.webp`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, webpBuffer, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    });

  if (error) {
    throw new Error(`上传失败: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  console.log(
    `   📤 ${origSize} KB → ${webpSize} KB WebP (减小 ${reduction}%)`
  );
  return publicUrlData.publicUrl;
}

/**
 * 查找与 .exe 匹配的预览图 (.jpg 优先，然后 .png)
 * @returns 图片路径或 null
 */
function findPreviewImage(exePath) {
  const baseName = exePath.replace(/\.exe$/i, "");
  const jpgPath = baseName + ".jpg";
  const pngPath = baseName + ".png";

  if (existsSync(jpgPath)) return jpgPath;
  if (existsSync(pngPath)) return pngPath;
  return null;
}

// ==================== 主流程 ====================

/**
 * 处理单个角色的单个子目录
 */
async function processSubdirectory(charConfig, subdir) {
  const dirPath = join(BASE_DIR, charConfig.name, subdir);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📁 ${charConfig.name}/${subdir}`);
  console.log(`${"=".repeat(60)}`);

  if (!existsSync(dirPath)) {
    console.log(`   ⚠️ 目录不存在，跳过`);
    return [];
  }

  // 1. 查找并解析 CSV
  const csvPaths = findCsvFiles(dirPath);
  const baiduRecords = csvPaths.baidu
    ? parseBaiduCsv(csvPaths.baidu)
    : [];
  const quarkRecords = csvPaths.quark
    ? parseQuarkCsv(csvPaths.quark)
    : [];

  if (!csvPaths.baidu && !csvPaths.quark) {
    console.log(`   ⚠️ 无 CSV 文件，跳过`);
    return [];
  }

  console.log(`   百度网盘: ${baiduRecords.length} 条${csvPaths.baidu ? "" : " (无CSV)"}`);
  console.log(`   夸克网盘: ${quarkRecords.length} 条${csvPaths.quark ? "" : " (无CSV)"}`);

  // 2. 按 key 合并
  const quarkMap = new Map();
  for (const r of quarkRecords) {
    quarkMap.set(r.key, r);
  }

  const mergedMods = [];
  const seenKeys = new Set();

  for (const bd of baiduRecords) {
    if (seenKeys.has(bd.key)) continue;
    seenKeys.add(bd.key);

    const qr = quarkMap.get(bd.key);
    const driveLinks = [{ platform: bd.platform, url: bd.url }];
    if (qr) {
      driveLinks.push({ platform: qr.platform, url: qr.url });
    }

    const { title, version } = parseFilename(bd.filename, charConfig.name);
    mergedMods.push({
      key: bd.key,
      filename: bd.filename,
      title,
      version,
      driveLinks,
    });
  }

  // 处理仅在夸克网盘中的记录
  for (const qr of quarkRecords) {
    if (!seenKeys.has(qr.key)) {
      seenKeys.add(qr.key);
      const { title, version } = parseFilename(qr.filename, charConfig.name);
      mergedMods.push({
        key: qr.key,
        filename: qr.filename,
        title,
        version,
        driveLinks: [{ platform: qr.platform, url: qr.url }],
      });
    }
  }

  console.log(`   合并后: ${mergedMods.length} 个 mod`);

  // 3. 列出 exe 文件
  const exeFiles = readdirSync(dirPath, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".exe"))
    .map((f) => f.name);

  const exeKeyMap = new Map();
  for (const exe of exeFiles) {
    exeKeyMap.set(exe.replace(/\.exe$/i, ""), exe);
  }

  // 4. 逐 mod 处理
  const results = [];
  let uploadCount = 0;
  let skipNoExe = 0;
  let skipNoImage = 0;

  for (const mod of mergedMods) {
    const modId = randomUUID();
    const exeFilename = exeKeyMap.get(mod.key);
    const exePath = exeFilename ? join(dirPath, exeFilename) : null;

    if (!exePath) {
      console.log(`   ⚠️ [${mod.title}] 无匹配 .exe，跳过`);
      skipNoExe++;
      continue;
    }

    // 查找预览图
    const imagePath = findPreviewImage(exePath);
    if (!imagePath) {
      console.log(`   ⚠️ [${mod.title}] 无预览图，跳过`);
      skipNoImage++;
      continue;
    }

    // 上传预览图
    let imageUrl = null;
    try {
      imageUrl = await uploadPreviewImage(
        imagePath,
        charConfig.storage_key,
        modId
      );
      uploadCount++;
      console.log(`   ✅ [${mod.title}]`);
    } catch (err) {
      console.log(`   ❌ [${mod.title}] 图片上传失败: ${err.message}`);
      continue;
    }

    const description = `${charConfig.name} ${mod.title} MOD，提供百度网盘与夸克网盘双渠道下载。`;

    results.push({
      id: modId,
      title: mod.title,
      character: charConfig.name,
      game_key: charConfig.game_key,
      game_version: GAME_VERSION,
      version: mod.version,
      description,
      download_url: null,
      drive_links: mod.driveLinks,
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
    `\n   📊 ${charConfig.name}/${subdir}: 上传 ${uploadCount}, 无exe ${skipNoExe}, 无图 ${skipNoImage}`
  );

  return results;
}

async function main() {
  const startTime = Date.now();
  let allResults = [];
  const summary = [];

  for (const charConfig of CHARACTER_CONFIGS) {
    console.log(`\n\n${"#".repeat(60)}`);
    console.log(`🎮 角色: ${charConfig.name} (${charConfig.game_key})`);
    console.log(`   子目录: ${charConfig.subdirs.join(", ")}`);
    console.log(`${"#".repeat(60)}`);

    for (const subdir of charConfig.subdirs) {
      const results = await processSubdirectory(charConfig, subdir);
      if (results.length > 0) {
        allResults = allResults.concat(results);
        summary.push({
          char: charConfig.name,
          subdir,
          count: results.length,
        });
      }
    }
  }

  // ==================== 批量插入 ====================

  console.log(`\n\n${"=".repeat(60)}`);
  console.log(`💾 批量写入数据库...`);
  console.log(`${"=".repeat(60)}`);
  console.log(`   共 ${allResults.length} 条记录`);

  if (allResults.length === 0) {
    console.log("   ⚠️ 无记录可写入");
    return;
  }

  // 分批插入，每批 50 条
  const BATCH_SIZE = 50;
  let insertedCount = 0;

  for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
    const batch = allResults.slice(i, i + BATCH_SIZE);
    console.log(
      `\n   📤 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allResults.length / BATCH_SIZE)}: ${batch.length} 条...`
    );

    const { data, error } = await supabase
      .from("mods")
      .insert(batch)
      .select("id, title");

    if (error) {
      console.error(`   ❌ 批次插入失败: ${error.message}`);
      console.error(`   Details: ${JSON.stringify(error)}`);
      // 继续尝试下一批
      continue;
    }

    insertedCount += data.length;
    console.log(`   ✅ 成功 ${data.length} 条`);
  }

  // ==================== 汇总 ====================

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\n${"#".repeat(60)}`);
  console.log(`📊 批量上传完成! (耗时 ${elapsed} 分钟)`);
  console.log(`${"#".repeat(60)}`);

  console.log(`\n   按角色汇总:`);
  for (const s of summary) {
    console.log(`   ${s.char}/${s.subdir}: ${s.count} 个`);
  }

  const totalFromSummary = summary.reduce((a, s) => a + s.count, 0);
  console.log(`\n   处理总数: ${totalFromSummary}`);
  console.log(`   写入成功: ${insertedCount}`);

  // 无预览图的 mod
  const noImageMods = allResults.filter((r) => !r.images || r.images.length === 0);
  if (noImageMods.length > 0) {
    console.warn(
      `   ⚠️ ${noImageMods.length} 个 mod 无预览图: ${noImageMods.map((r) => r.title).join(", ")}`
    );
  }
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
