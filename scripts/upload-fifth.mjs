/**
 * 上传「第五次上传」批量 Mod：夸克 CSV/TXT 链接 + 顶层预览图 → 腾讯云 COS + Supabase。
 *
 * 用法:
 *   node scripts/upload-fifth.mjs --dry-run   # 只解析 + 匹配 + 转 WebP，不上传不入库
 *   node scripts/upload-fifth.mjs              # 正式上传
 *
 * 数据源:
 *   CSV/TXT: D:\...\wMOD全集-每日更新\第五次上传\exe分类\<角色>\ (每角色一个 CSV 或 TXT)
 *   图片:    D:\...\wMOD全集-每日更新\第五次上传\*.png / *.jpg  （mod exe 名对应图片名）
 *
 * 关键点（按用户确认的归类）:
 *   1. 角色 mod（前缀=角色名）→ 归到对应角色，title 去前缀。
 *   2. 武器类（停驻之烟-QBZ-97、千古-赛琳娜武器、清宵专武-极霸剑）→ character="武器"（新类目）。
 *   3. 科考摩托 → character="滑翔翼,翱翔翼,科考摩托"。
 *   4. UI 夹内: 全ui/编队/背包/加载/索拉指南/椋羽/隐藏UID → "UI"；鼠标指针/RabbitFX/去角色轮廓 → "反虚化，ui界面，场景，葫芦，特效等"。
 *   5. 爱弥斯的机甲-*、移除清宵的飞剑 → 保留完整 title。
 *   6. 清宵专武-极霸剑 → 武器；清宵背后的剑-极霸剑 → 清宵（避免撞名）。
 *   7. 清霄(霄) 变体 → 归一化到清宵。
 *   8. 爱弥斯-丰汝肥屯（上下）by slap 的预览图是 ...by slap-mosaic.png（作者名差异，用手动映射）。
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

const BASE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\第五次上传`;
const EXE_DIR = join(BASE, "exe分类");

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

/**
 * 角色前缀 → 标准角色名。按前缀长度降序（长前缀优先）。
 * keepFull: true 时 title 保留完整 key。
 */
const CHARACTER_PREFIX_MAP = [
  // 特殊归类
  { prefix: "科考摩托", character: "滑翔翼,翱翔翼,科考摩托", keepFull: true },
  { prefix: "爱弥斯的机甲", character: "爱弥斯", keepFull: true },
  { prefix: "琳奈专武", character: "武器" },
  { prefix: "清宵专武", character: "武器" },          // 极霸剑 → 武器
  { prefix: "清宵背后的剑", character: "清宵" },        // 极霸剑 → 清宵
  { prefix: "移除清宵的飞剑", character: "清宵", keepFull: true },
  { prefix: "停驻之烟", character: "武器", keepFull: true },
  { prefix: "千古", character: "武器", keepFull: true },
  // 常规角色（拼写变体归一化）
  { prefix: "洛瑟拉", character: "洛瑟菈" },
  { prefix: "洛瑟菈", character: "洛瑟菈" },
  { prefix: "清宵", character: "清宵" },
  { prefix: "清霄", character: "清宵" },
  { prefix: "爱弥斯", character: "爱弥斯" },
  { prefix: "丹瑾", character: "丹瑾" },
  { prefix: "凌阳", character: "凌阳" },
  { prefix: "千咲", character: "千咲" },
  { prefix: "卡提希娅", character: "卡提希娅" },
  { prefix: "吟霖", character: "吟霖" },
  { prefix: "嘉贝莉娜", character: "嘉贝莉娜" },
  { prefix: "坎特蕾拉", character: "坎特蕾拉" },
  { prefix: "女漂", character: "女漂" },
  { prefix: "尤诺", character: "尤诺" },
  { prefix: "弗洛洛", character: "弗洛洛" },
  { prefix: "炽霞", character: "炽霞" },
  { prefix: "玄翎", character: "玄翎" },
  { prefix: "珂莱塔", character: "珂莱塔" },
  { prefix: "琳奈", character: "琳奈" },
  { prefix: "秧秧", character: "秧秧" },
  { prefix: "穗穗", character: "穗穗" },
  { prefix: "绯雪", character: "绯雪" },
  { prefix: "莫宁", character: "莫宁" },
  { prefix: "菲比", character: "菲比" },
  { prefix: "达妮娅", character: "达妮娅" },
  { prefix: "鉴心", character: "鉴心" },
];

// UI 文件夹内：这些前缀 → 反虚化…特效等；其余 → UI
const UI_MISC_PREFIXES = ["鼠标指针", "RabbitFX", "去角色轮廓"];

// 预览图手动映射：mod key（去 .exe）→ 图片文件名（作者名与图片不一致时的补充）
const IMAGE_OVERRIDES = {
  "爱弥斯-丰汝肥屯（上下）by slap": "爱弥斯-丰汝肥屯（上下）by slap-mosaic.png",
};

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
    const urlMatch = shareContent.match(/https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?pwd=[^&\s]+)?/);
    const url = urlMatch ? urlMatch[0] : "";
    const filename = shareName.trim();
    const key = filename.replace(/\.exe$/i, "");
    if (key && url) records.push({ key, filename, url, code: remainingParts[0]?.trim() || "" });
    i++;
  }
  return records;
}

// ==================== TXT 解析（夸克纯文本） ====================

function parseQuarkTxt(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = [];
  const keyMatch = raw.match(/「(.+?)\.exe」/);
  const urlMatch = raw.match(/https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?pwd=[^&\s]+)?/);
  if (!keyMatch || !urlMatch) return records;
  const key = keyMatch[1].trim();
  if (key) records.push({ key, filename: keyMatch[1], url: urlMatch[0], code: "" });
  return records;
}

// ==================== 分类解析 ====================

/** 解析角色 + title。folder 用于 UI 夹特殊归类 */
function resolveCharacterAndTitle(key, folder) {
  // UI 夹优先：全按 UI / 反虚化 归类，不套角色前缀
  if (folder === "UI") {
    const isMisc = UI_MISC_PREFIXES.some((p) => key.startsWith(p));
    return { character: isMisc ? "反虚化，ui界面，场景，葫芦，特效等" : "UI", title: key };
  }
  for (const { prefix, character, keepFull } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title;
      if (keepFull) {
        title = key;
      } else {
        title = key.slice(prefix.length);
        title = title.replace(/^[-－\s]+/, "").trim();
        if (!title) title = key;
      }
      return { character, title };
    }
  }
  // 兜底：以文件夹名为角色，title 去前缀
  const esc = folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let title = key.replace(new RegExp(`^${esc}[-－\\s]*`), "").trim();
  if (!title) title = key;
  return { character: folder, title };
}

// ==================== 图片索引 ====================

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function buildImageIndex(dir) {
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = basename(e.name, ext);
    if (!map.has(base)) map.set(base, join(dir, e.name));
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

  // 1. 遍历每个角色夹，解析 CSV + TXT
  const folders = readdirSync(EXE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const unique = [];
  const seen = new Set();
  for (const folder of folders) {
    const subDir = join(EXE_DIR, folder.name);
    let records = [];
    for (const c of readdirSync(subDir).filter((f) => f.endsWith(".csv"))) {
      records = records.concat(parseQuarkCsv(join(subDir, c)));
    }
    for (const t of readdirSync(subDir).filter((f) => f.endsWith(".txt"))) {
      records = records.concat(parseQuarkTxt(join(subDir, t)));
    }
    for (const r of records) {
      const k = r.key + "|" + r.url;
      if (!seen.has(k)) { seen.add(k); unique.push({ ...r, folder: folder.name }); }
    }
  }
  console.log(`📋 解析到 ${unique.length} 条去重 mod 记录`);

  // 2. 图片索引
  const imageMap = buildImageIndex(BASE);
  console.log(`🖼  顶层预览图索引: ${imageMap.size} 张`);

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
  const existingSet = new Set(existing.map((m) => `${m.character}|${m.title?.trim() ?? ""}`));
  console.log(`🗄  现有 mod 记录: ${existing.length}（分页拉取）`);

  // 4. 逐条处理
  const results = [];
  let matchedImage = 0;
  let placeholder = 0;
  let skipDup = 0;
  const charCount = {};
  const placeholderKeys = [];
  const skipDupKeys = [];

  for (let idx = 0; idx < unique.length; idx++) {
    const record = unique[idx];
    const { character, title } = resolveCharacterAndTitle(record.key, record.folder);

    if (existingSet.has(`${character}|${title.trim()}`)) {
      skipDup++;
      skipDupKeys.push(`${character} | ${title}`);
      continue;
    }

    const modId = randomUUID();
    const versionMatch = title.match(/v(\d+[\d.]*)/i);
    const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

    // 预览图：精确匹配 + 手动映射
    let imagePath = imageMap.get(record.key) || null;
    if (!imagePath && IMAGE_OVERRIDES[record.key]) {
      const mapped = IMAGE_OVERRIDES[record.key];
      imagePath = imageMap.get(basename(mapped, extname(mapped))) || null;
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
          console.log(`   [${idx + 1}/${unique.length}] 🖼  ${character} | ${title}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
        } else {
          await uploadToCos(objectKey, buffer, "image/webp");
          imageUrl = buildCosUrl(objectKey);
          console.log(`   [${idx + 1}/${unique.length}] ✅ ${character} | ${title}`);
        }
      } catch (err) {
        console.error(`   [${idx + 1}/${unique.length}] ❌ ${record.key}: ${err.message}`);
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
    console.log("\n⏭️  已存在跳过:");
    skipDupKeys.forEach((k) => console.log(`   - ${k}`));
  }

  console.log(`\n=== 按角色汇总 (待上传 ${results.length} 条) ===`);
  const charRows = Object.entries(charCount).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of charRows) console.log(`   ${c.padEnd(20)} ${n}`);

  if (placeholderKeys.length) {
    console.log("\n⚠️  以下记录使用占位图（未匹配到预览图）:");
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
