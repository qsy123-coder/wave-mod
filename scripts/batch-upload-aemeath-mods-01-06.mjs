/**
 * 批量上传爱弥斯 Mod 到 Supabase（文件夹 01-06）
 *
 * 用法: node scripts/batch-upload-aemeath-mods-01-06.mjs
 *
 * 前提:
 *   1. .env.local 中已配置 SUPABASE_SERVICE_ROLE_KEY
 *   2. 源文件夹存在: D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\爱弥斯\01 ~ 06
 *
 * 功能:
 *   1. 遍历 01-06 文件夹，每个文件夹解析对应的百度网盘 + 夸克网盘 CSV
 *   2. 按文件名匹配合并两个网盘的下载链接
 *   3. 从文件名解析 title 和 version
 *   4. 批量 INSERT 到 mods 表（无图片，需后续补传）
 *
 * 与 00 文件夹脚本的区别:
 *   - 支持多个源文件夹（01-06）
 *   - 自动发现每个文件夹内的 CSV 文件
 *   - 跳过图片上传（无解压后的子目录，无 preview.png）
 *   - 跳过 JASM config（无解压后的子目录）
 *   - 上传前检查数据库中是否已存在同名 mod
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

// 先加载 .env，再加载 .env.local — .env.local 优先（覆盖模式）
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ==================== 配置 ====================

const BASE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\爱弥斯`;
const SOURCE_FOLDERS = ["01", "02", "03", "04", "05", "06"];

const CHAR_NAME = "爱弥斯";
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

  // 跳过表头
  if (lines[0]?.startsWith("创建分享状态")) {
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    // 每行以 "成功," 或 "失败," 开头
    const firstComma = line.indexOf(",");
    if (firstComma === -1) {
      i++;
      continue;
    }

    const _status = line.slice(0, firstComma);
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

    // 剩余字段: 提取码,分享时间
    const remainingParts = rest.split(",");
    const extractCode = remainingParts[0]?.trim() || "";
    const _shareTime = remainingParts[1]?.trim() || "";

    // 从分享内容中提取夸克网盘链接
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

// ==================== 文件名解析 ====================

/**
 * 从文件名提取 mod title 和 version
 */
function parseFilename(filename) {
  let name = filename.replace(/\.exe$/i, "");

  const prefixes = [
    /^爱弥斯（含机甲）[-\s]*/,
    /^爱弥斯[-\s]*/,
    /^爱弥丝[-\s]*/,
  ];

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

// ==================== 数据库查询 ====================

/**
 * 查询数据库中已存在的 mod titles（用于去重）
 */
async function getExistingTitles() {
  const { data, error } = await supabase
    .from("mods")
    .select("title")
    .eq("character", CHAR_NAME);

  if (error) {
    console.error("⚠️ 查询已有 mod 失败:", error.message);
    return new Set();
  }

  return new Set(data.map((r) => r.title));
}

// ==================== 处理单个文件夹 ====================

async function processFolder(folderName) {
  const sourceDir = join(BASE_DIR, folderName);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📁 处理文件夹: ${folderName}`);
  console.log(`${"=".repeat(60)}`);

  if (!existsSync(sourceDir)) {
    console.log(`   ❌ 文件夹不存在: ${sourceDir}`);
    return [];
  }

  // 查找 CSV 文件
  const allFiles = readdirSync(sourceDir);
  const baiduCsv = allFiles.find((f) => f.startsWith("批量分享记录_") && f.endsWith(".csv"));
  const quarkCsv = allFiles.find((f) => f.startsWith("分享结果导出-") && f.endsWith(".csv"));

  if (!baiduCsv) {
    console.log(`   ❌ 找不到百度网盘 CSV (批量分享记录_*.csv)`);
    return [];
  }
  if (!quarkCsv) {
    console.log(`   ❌ 找不到夸克网盘 CSV (分享结果导出-*.csv)`);
    return [];
  }

  const baiduPath = join(sourceDir, baiduCsv);
  const quarkPath = join(sourceDir, quarkCsv);

  console.log(`   📄 百度网盘 CSV: ${baiduCsv}`);
  console.log(`   📄 夸克网盘 CSV: ${quarkCsv}`);

  // 解析两个 CSV
  const baiduRecords = parseBaiduCsv(baiduPath);
  console.log(`   百度网盘: ${baiduRecords.length} 条记录`);

  const quarkRecords = parseQuarkCsv(quarkPath);
  console.log(`   夸克网盘: ${quarkRecords.length} 条记录`);

  // 按 key 合并
  const quarkMap = new Map();
  for (const r of quarkRecords) {
    quarkMap.set(r.key, r);
  }

  const mergedMods = [];
  const unmatchedQuark = new Set(quarkMap.keys());

  for (const bd of baiduRecords) {
    const qr = quarkMap.get(bd.key);
    if (qr) unmatchedQuark.delete(bd.key);

    const driveLinks = [{ platform: bd.platform, url: bd.url }];
    if (qr) {
      driveLinks.push({ platform: qr.platform, url: qr.url });
    }

    const { title, version } = parseFilename(bd.filename);

    mergedMods.push({
      key: bd.key,
      filename: bd.filename,
      title,
      version,
      driveLinks,
    });
  }

  console.log(`   合并后: ${mergedMods.length} 个 mod`);
  if (unmatchedQuark.size > 0) {
    console.log(
      `   ⚠️ 仅在夸克网盘中（无百度匹配）: ${[...unmatchedQuark].slice(0, 5).join(", ")}${unmatchedQuark.size > 5 ? ` ...等${unmatchedQuark.size - 5}个` : ""}`
    );
  }

  // 构建结果
  const results = [];
  for (const mod of mergedMods) {
    const modId = randomUUID();
    const description = `爱弥斯 ${mod.title} MOD，提供百度网盘与夸克网盘双渠道下载。`;

    results.push({
      id: modId,
      title: mod.title,
      character: CHAR_NAME,
      game_key: GAME_KEY,
      game_version: GAME_VERSION,
      version: mod.version,
      description,
      download_url: null,
      drive_links: mod.driveLinks,
      nsfw: false,
      is_published: true,
      is_available: true,
      images: [], // 无预览图，后续补传
      xxmi_install_guide: XXMI_GUIDE,
      mod_author_url: null, // 无 JASM config
      video_url: null,
      created_by: null,
    });
  }

  return results;
}

// ==================== 主流程 ====================

async function main() {
  console.log("\n🚀 开始批量上传爱弥斯 Mod (文件夹 01-06)\n");

  // 查询已有 mod
  console.log("🔍 查询数据库中已有 mod...");
  const existingTitles = await getExistingTitles();
  console.log(`   数据库中已有 ${existingTitles.size} 个 ${CHAR_NAME} mod\n`);

  // 处理所有文件夹
  let allResults = [];
  const folderStats = [];

  for (const folderName of SOURCE_FOLDERS) {
    const results = await processFolder(folderName);
    folderStats.push({ folder: folderName, count: results.length });
    allResults = allResults.concat(results);
  }

  // 去重：跳过数据库中已存在的
  const newMods = allResults.filter((r) => !existingTitles.has(r.title));
  const duplicates = allResults.filter((r) => existingTitles.has(r.title));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 汇总统计`);
  console.log(`${"=".repeat(60)}`);
  for (const stat of folderStats) {
    console.log(`   文件夹 ${stat.folder}: ${stat.count} 个 mod`);
  }
  console.log(`   总计: ${allResults.length} 个 mod`);
  console.log(`   新 mod: ${newMods.length} 个`);
  console.log(`   重复（跳过）: ${duplicates.length} 个`);

  if (duplicates.length > 0 && duplicates.length <= 10) {
    console.log(`   重复列表: ${duplicates.map((r) => r.title).join(", ")}`);
  }

  if (newMods.length === 0) {
    console.log("\n✅ 没有新 mod 需要上传。");
    return;
  }

  // 批量插入
  console.log(`\n💾 批量写入 ${newMods.length} 条记录到数据库...\n`);

  // 分批插入（每批最多 50 条，避免请求过大）
  const BATCH_SIZE = 50;
  let insertedCount = 0;

  for (let i = 0; i < newMods.length; i += BATCH_SIZE) {
    const batch = newMods.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(newMods.length / BATCH_SIZE);

    console.log(`   📤 写入第 ${batchNum}/${totalBatches} 批 (${batch.length} 条)...`);

    const { data, error } = await supabase
      .from("mods")
      .insert(batch)
      .select("id, title");

    if (error) {
      console.error(`   ❌ 第 ${batchNum} 批插入失败: ${error.message}`);
      console.error(`   Details: ${JSON.stringify(error)}`);

      // 尝试逐条插入以定位问题记录
      console.log(`   🔄 尝试逐条插入...`);
      for (const mod of batch) {
        const { error: singleError } = await supabase
          .from("mods")
          .insert([mod])
          .select("id");
        if (singleError) {
          console.error(`      ❌ "${mod.title}": ${singleError.message}`);
        } else {
          console.log(`      ✅ "${mod.title}"`);
          insertedCount++;
        }
      }
    } else {
      console.log(`   ✅ 第 ${batchNum} 批成功: ${data.length} 条`);
      insertedCount += data.length;
    }
  }

  console.log(`\n✅ 批量上传完成! 成功写入 ${insertedCount} 条记录`);

  // 最终汇总
  console.log(`\n📊 最终统计:`);
  for (const stat of folderStats) {
    console.log(`   文件夹 ${stat.folder}: ${stat.count} 个`);
  }
  console.log(`   总计处理: ${allResults.length} 个`);
  console.log(`   跳过重复: ${duplicates.length} 个`);
  console.log(`   成功写入: ${insertedCount} 个`);
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
