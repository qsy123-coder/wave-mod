/**
 * 批量上传爱弥斯 Mod 到 Supabase
 *
 * 用法: node scripts/batch-upload-aemeath-mods.mjs
 *
 * 前提:
 *   1. .env.local 中已配置 SUPABASE_SERVICE_ROLE_KEY
 *   2. 源文件夹存在: D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\爱弥斯\00
 *
 * 功能:
 *   1. 解析百度网盘 CSV + 夸克网盘 CSV，按文件名匹配
 *   2. 上传每个 mod 的 preview.png 到 Supabase Storage
 *   3. 批量插入 mods 表
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

// 先加载 .env，再加载 .env.local — .env.local 优先（覆盖模式）
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ==================== 配置 ====================

const SOURCE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\爱弥斯\00`;
const CSV1_PATH = join(SOURCE_DIR, "批量分享记录_202607181701.csv");
const CSV2_PATH = join(SOURCE_DIR, "分享结果导出-1784365195026.csv");

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

const STORAGE_BUCKET = "mod-assets";

// ==================== Supabase Client ====================

function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    console.error("❌ 缺少 Supabase 环境变量。请检查 .env.local");
    console.error(
      `   NEXT_PUBLIC_SUPABASE_URL=${url || "(空)"}`
    );
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
  // 跳过表头
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
 *
 * 分享地址格式:
 *   "我用夸克网盘给你分享了「xxx.exe」，点击链接或复制整段内容，打开「夸克APP」即可获取。
 *   链接：https://pan.quark.cn/s/xxxx?pwd=XXXX
 *   提取码：XXXX"
 */
function parseQuarkCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");

  // 用状态机解析含多行引号字段的 CSV
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
      rest = rest.slice(1); // 去掉开头的引号
      // 收集直到遇到单独的 " 后跟逗号
      let contentLines = [];
      while (i < lines.length) {
        const cl = rest;
        // 检查 rest 是否包含结束引号（" 后跟逗号或行尾）
        const endIdx = cl.indexOf('",');
        if (endIdx !== -1) {
          contentLines.push(cl.slice(0, endIdx));
          rest = cl.slice(endIdx + 2);
          break;
        }
        // 检查是否以 " 结尾（字段结束，行尾）
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
 *
 * 例子:
 *   "爱弥斯-白银之城-灰姑娘v1.1.exe"  → title="白银之城-灰姑娘v1.1", version="v1.1"
 *   "爱弥斯（含机甲）-光芒四射（alt+上下左右67890切换).exe" → title="光芒四射", version="未标注"
 *   "爱弥斯-半透衬衫.exe" → title="半透衬衫", version="未标注"
 *   "爱弥丝-七实 by MonkeyObligation（小键盘1~8切换）.exe" → title="七实 by MonkeyObligation", version="未标注"
 *   "AemeathThiccMod.exe" → title from JASM config or "AemeathThiccMod", version="未标注"
 */
function parseFilename(filename) {
  // 去掉 .exe
  let name = filename.replace(/\.exe$/i, "");

  // 角色前缀匹配模式
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

  // 如果 title 还是等于 name（没有匹配到中文前缀），保留原名
  // 处理括号内容：保留作者/切换说明等信息
  // 例如 "七实 by MonkeyObligation（小键盘1~8切换）" → 保留完整

  // 提取版本号
  const versionMatch = title.match(/v(\d+[\d.]*)/i);
  const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

  return { title: title || name, version };
}

/**
 * 读取 JASM_ModConfig.json 获取自定义名称和作者链接
 */
function readJasmConfig(folderPath) {
  const jasmPath = join(folderPath, ".JASM_ModConfig.json");
  if (!existsSync(jasmPath)) return null;
  try {
    const raw = readFileSync(jasmPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ==================== 图片上传 ====================

/**
 * 上传 preview.png 到 Supabase Storage
 * 返回 publicUrl
 */
async function uploadPreviewImage(folderPath, modId) {
  const previewPath = join(folderPath, "preview.png");
  if (!existsSync(previewPath)) {
    console.warn(`   ⚠️ 没有 preview.png，跳过图片上传`);
    return null;
  }

  const fileBuffer = readFileSync(previewPath);
  const fileSize = statSync(previewPath).size;
  console.log(`   📤 上传 preview.png (${(fileSize / 1024).toFixed(1)} KB)...`);

  const storagePath = `mods/aemeath/${modId}/preview.png`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      cacheControl: "31536000",
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    console.error(`   ❌ 上传失败: ${error.message}`);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  console.log(`   ✅ 上传成功: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}

// ==================== 主流程 ====================

async function main() {
  console.log("\n📦 解析 CSV 文件...\n");

  // 1. 解析两个 CSV
  const baiduRecords = parseBaiduCsv(CSV1_PATH);
  console.log(`   百度网盘: ${baiduRecords.length} 条记录`);

  const quarkRecords = parseQuarkCsv(CSV2_PATH);
  console.log(`   夸克网盘: ${quarkRecords.length} 条记录`);

  // 2. 按 key（文件名去.exe）合并
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
      `   ⚠️ 仅在夸克网盘中（无百度匹配）: ${[...unmatchedQuark].join(", ")}`
    );
  }

  // 3. 列出文件夹并匹配
  const folders = readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log(`\n📁 源文件夹: ${folders.length} 个子目录\n`);

  // 建立 key → folder 映射（folder name 就是 key）
  const folderMap = new Map();
  for (const folder of folders) {
    folderMap.set(folder, join(SOURCE_DIR, folder));
  }

  // 4. 逐 mod 处理
  const results = [];

  for (const mod of mergedMods) {
    const modId = randomUUID();
    const folderPath = folderMap.get(mod.key);

    console.log(`\n--- ${mod.title} ---`);
    console.log(`   Key: ${mod.key}`);
    console.log(`   Version: ${mod.version}`);

    // 查找文件夹（尝试精确匹配和模糊匹配）
    let actualFolder = folderPath;
    if (!actualFolder) {
      // 模糊匹配：尝试找包含 key 的文件夹
      for (const [folderName, fp] of folderMap) {
        if (
          folderName.includes(mod.key.slice(0, 10)) ||
          mod.key.includes(folderName.slice(0, 10))
        ) {
          actualFolder = fp;
          console.log(`   🔍 模糊匹配文件夹: ${folderName}`);
          break;
        }
      }
    }

    if (!actualFolder) {
      console.log(`   ⚠️ 找不到对应文件夹，跳过图片上传`);
    }

    // JASM config
    let jasmConfig = null;
    let customTitle = null;
    let authorUrl = null;
    if (actualFolder) {
      jasmConfig = readJasmConfig(actualFolder);
      if (jasmConfig?.customName) {
        customTitle = jasmConfig.customName;
        console.log(`   📝 JASM customName: ${customTitle}`);
      }
      if (jasmConfig?.modUrl) {
        authorUrl = jasmConfig.modUrl;
        console.log(`   🔗 JASM modUrl: ${authorUrl}`);
      }
      if (jasmConfig?.author && !authorUrl) {
        // author field exists but no URL
        console.log(`   👤 JASM author: ${jasmConfig.author}`);
      }
    }

    // 上传 preview 图片
    let imageUrl = null;
    if (actualFolder) {
      imageUrl = await uploadPreviewImage(actualFolder, modId);
    }

    const images = imageUrl ? [imageUrl] : [];

    // 最终 title（优先用 JASM customName）
    const finalTitle = customTitle || mod.title;
    const description = `爱弥斯 ${finalTitle} MOD，提供百度网盘与夸克网盘双渠道下载。`;

    console.log(`   📝 Final title: ${finalTitle}`);
    console.log(`   🖼️  Images: ${images.length} 张`);
    console.log(
      `   🔗 Drive links: ${mod.driveLinks.map((d) => d.platform).join(", ")}`
    );

    results.push({
      id: modId,
      title: finalTitle,
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
      images,
      xxmi_install_guide: XXMI_GUIDE,
      mod_author_url: authorUrl,
      video_url: null,
      created_by: null,
    });
  }

  // 5. 批量插入
  console.log("\n\n💾 批量写入数据库...\n");
  console.log(`   共 ${results.length} 条记录`);

  // 检查 images 为空的 mod
  const noImageMods = results.filter((r) => r.images.length === 0);
  if (noImageMods.length > 0) {
    console.warn(
      `   ⚠️ ${noImageMods.length} 个 mod 没有预览图: ${noImageMods.map((r) => r.title).join(", ")}`
    );
  }

  const { data, error } = await supabase.from("mods").insert(results).select("id, title");

  if (error) {
    console.error(`\n❌ 批量插入失败: ${error.message}`);
    console.error(`   Details: ${JSON.stringify(error)}`);
    process.exit(1);
  }

  console.log(`\n✅ 成功插入 ${data.length} 条记录:`);
  for (const row of data) {
    console.log(`   ${row.id} - ${row.title}`);
  }

  // 6. 汇总
  console.log("\n\n📊 批量上传完成!");
  console.log(`   百度网盘: ${baiduRecords.length} 条`);
  console.log(`   夸克网盘: ${quarkRecords.length} 条`);
  console.log(`   合并 Mod: ${mergedMods.length} 个`);
  console.log(`   写入成功: ${data.length} 条`);

  if (noImageMods.length > 0) {
    console.log(
      `   ⚠️ ${noImageMods.length} 个 mod 无预览图: ${noImageMods.map((r) => r.title).join(", ")}`
    );
  }
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
