/**
 * 上传「A_每日更新」按日期子目录批次 Mod：夸克 CSV + 预览图 → 腾讯云 COS + Supabase。
 *
 * 与 upload-a-daily.mjs 的区别：
 *   1. 数据组织为日期子目录 W-YYYY.M.D（每目录一个 CSV + exe + 预览图；
 *      预览图在顶层或「预览图」子目录）。
 *   2. 每条记录显式设置 created_at = 该目录日期中午(上海时区)，保证每日更新页
 *      按 9.4 / 9.5 / 9.6 分组，而不会全部落到"今天"。
 *
 * 用法:
 *   node scripts/upload-daily-by-date.mjs --dry-run   # 只解析 + 匹配 + 转 WebP，不上传不入库
 *   node scripts/upload-daily-by-date.mjs              # 正式上传
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

const BASE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;

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

const SKIP_PREFIXES = ["清宵-邪"];

/** 角色前缀 → 标准角色名，title 去前缀 */
const CHARACTER_PREFIX_MAP = [
  { prefix: "清宵", character: "清宵" },
  { prefix: "清霄", character: "清宵" }, // 变体归一化
  { prefix: "玄翎", character: "玄翎" },
  { prefix: "洛瑟菈", character: "洛瑟菈" },
  { prefix: "穗穗", character: "穗穗" },
  { prefix: "相里要", character: "相里要" },
  { prefix: "达妮娅", character: "达妮娅" },
  { prefix: "女漂皮肤", character: "女漂" }, // 「女漂皮肤{星火永明]-…」归女漂
  { prefix: "琳奈皮肤", character: "琳奈" }, // 「琳奈皮肤[薄荷糖]-…」归琳奈
];

/** UI 类：这些「全ui」固定进 UI 分类，title 去角色名、保留「全ui-…」 */
const UI_CHARS = ["卡提希娅", "坎特蕾拉", "菲比", "露帕"];

/** 前缀 → UI 分类（如「索拉指南-长离动态nsfw」整包皮肤归 UI，title 去前缀） */
const UI_PREFIXES = ["索拉指南"];

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

// ==================== 分类解析 ====================

function resolveCharacterAndTitle(key) {
  // UI 类：角色名 + 「全ui」
  for (const ch of UI_CHARS) {
    if (key.startsWith(ch + "全ui")) {
      return { character: "UI", title: key.slice(ch.length) };
    }
  }
  // UI 类：前缀直匹配（如索拉指南-长离动态nsfw），title 去前缀
  for (const p of UI_PREFIXES) {
    if (key.startsWith(p)) {
      const title = key.slice(p.length).replace(/^[-－\s]+/, "").trim() || key;
      return { character: "UI", title };
    }
  }
  // 角色类：前缀=角色，title 去前缀
  // 但「XX皮肤」类前缀（女漂皮肤/琳奈皮肤）保留完整 title——那是皮肤标题的一部分
  for (const { prefix, character } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title = key.slice(prefix.length).replace(/^[-－\s]+/, "").trim();
      // 「XX皮肤」类前缀，皮肤名是标题一部分 → 完整保留 title
      if (prefix.includes("皮肤")) title = key;
      if (!title) title = key;
      return { character, title };
    }
  }
  return { character: key.split(/[-－]/)[0] || key, title: key };
}

// ==================== 图片索引（目录顶层 + 预览图 子目录，png 优先） ====================

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const PREFERRED_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function indexFilesInto(byBase, dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = basename(e.name, ext);
    if (!byBase.has(base)) byBase.set(base, []);
    // 记录文件所在目录，避免子目录图片被拼到顶层路径
    byBase.get(base).push({ file: join(dir, e.name), ext });
  }
}

function buildImageIndex(dir) {
  const byBase = new Map();
  // 先扫顶层，再扫「预览图」子目录（子目录可能被顶层同名覆盖，需顶层优先）
  indexFilesInto(byBase, dir);
  indexFilesInto(byBase, join(dir, "预览图"));
  const map = new Map();
  for (const [base, list] of byBase) {
    list.sort((a, b) => PREFERRED_EXTS.indexOf(a.ext) - PREFERRED_EXTS.indexOf(b.ext));
    map.set(base, list[0].file);
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

// ==================== 日期目录解析 ====================

// "W-2026.9.4" → { y:2026, m:9, d:4 }；返回 null 表示不是日期目录
const DATE_DIR_RE = /^W-(\d{4})\.(\d{1,2})\.(\d{1,2})$/;

function parseDateDir(name) {
  const m = DATE_DIR_RE.exec(name);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// 生成该日期"上海中午"的 ISO 时间戳，保证 DailyUpdate 按该日期归组
function noonShanghaiISO({ y, m, d }) {
  // 上海 = UTC+8，中午12:00 → UTC 04:00
  const padded = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return `${padded}T04:00:00.000Z`;
}

// ==================== 主流程 ====================

async function main() {
  const startTime = Date.now();
  if (isDryRun) console.log("🔍 DRY-RUN 模式：解析 + 匹配 + 转 WebP，不实际上传/入库。\n");

  // 1. 发现日期子目录（按日期升序处理，输出更符合直觉）
  const dirEntries = readdirSync(BASE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
    .map((e) => ({ name: e.name, date: parseDateDir(e.name) }))
    .sort((a, b) => {
      const ka = a.date.y * 10000 + a.date.m * 100 + a.date.d;
      const kb = b.date.y * 10000 + b.date.m * 100 + b.date.d;
      return ka - kb;
    });

  if (dirEntries.length === 0) {
    console.error("❌ 未发现任何 W-YYYY.M.D 日期子目录");
    process.exit(1);
  }
  console.log(`📁 发现 ${dirEntries.length} 个日期子目录: ${dirEntries.map((d) => d.name).join(", ")}\n`);

  // 2. 查询现有记录用于去重（character|title）
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
  console.log(`🗄  现有 mod 记录: ${existing.length}\n`);

  // 3. 逐目录处理
  const results = [];
  const placeholderKeys = [];
  const skipDupKeys = [];
  const charCount = {};
  let matchedImage = 0;
  let placeholder = 0;
  let skipDup = 0;

  for (const dir of dirEntries) {
    const dirPath = join(BASE, dir.name);
    const created_at = noonShanghaiISO(dir.date);
    const dateLabel = `${dir.date.y}-${dir.date.m}-${dir.date.d}`;
    console.log(`===== ${dir.name} (created_at=${created_at}) =====`);

    // 3a. 解析该目录内 CSV
    const csvs = readdirSync(dirPath).filter((fn) => fn.endsWith(".csv"));
    if (csvs.length === 0) {
      console.log(`   ⚠️ 无 CSV，跳过`);
      continue;
    }
    const records = [];
    for (const f of csvs) records.push(...parseQuarkCsv(join(dirPath, f)));

    // 3b. 目录内去重 + 剔除
    const unique = [];
    const seen = new Set();
    for (const r of records) {
      const k = r.key + "|" + r.url;
      if (seen.has(k)) continue;
      seen.add(k);
      if (SKIP_PREFIXES.some((p) => r.key.startsWith(p))) continue;
      unique.push(r);
    }
    console.log(`   解析 ${records.length} 条，去重后 ${unique.length} 条`);

    // 3c. 该目录图片索引
    const imageMap = buildImageIndex(dirPath);
    console.log(`   预览图索引: ${imageMap.size} 个唯一 base`);

    // 3d. 逐条处理
    for (const record of unique) {
      const { character, title } = resolveCharacterAndTitle(record.key);
      if (existingSet.has(`${character}|${title.trim()}`)) {
        skipDup++;
        skipDupKeys.push(`${dateLabel} · ${character} | ${title}`);
        continue;
      }

      const modId = randomUUID();
      const versionMatch = title.match(/v(\d+[\d.]*)/i);
      const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

      const imagePath = imageMap.get(record.key) || null;
      let imageUrl;
      if (!imagePath) {
        imageUrl = PLACEHOLDER_IMAGE_URL;
        placeholder++;
        placeholderKeys.push(`${dateLabel} · ${character} | ${title}`);
      } else {
        matchedImage++;
        try {
          const { buffer, origSizeKB, webpSizeKB, reduction } = await convertToWebP(imagePath);
          const objectKey = `mods/${slugify(character)}/${modId}/preview.webp`;
          if (isDryRun) {
            imageUrl = buildCosUrl(objectKey);
            console.log(`   🖼  ${dateLabel} ${character} | ${title}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
          } else {
            await uploadToCos(objectKey, buffer, "image/webp");
            imageUrl = buildCosUrl(objectKey);
            console.log(`   ✅ ${dateLabel} ${character} | ${title}`);
          }
        } catch (err) {
          console.error(`   ❌ ${record.key}: ${err.message}`);
          imageUrl = PLACEHOLDER_IMAGE_URL;
          placeholder++;
          placeholderKeys.push(`${dateLabel} · ${character} | ${title}`);
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
        created_at, // 显式设置：归属该日期，保证每日更新页按日期分组
      });
    }
    console.log("");
  }

  console.log(`\n✅ 匹配预览图: ${matchedImage}，占位图: ${placeholder}，去重跳过: ${skipDup}`);

  if (skipDupKeys.length) {
    console.log("\n⏭️  已存在跳过:");
    skipDupKeys.forEach((k) => console.log(`   - ${k}`));
  }

  console.log(`\n=== 按分类汇总 (待上传 ${results.length} 条) ===`);
  const charRows = Object.entries(charCount).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of charRows) console.log(`   ${c.padEnd(20)} ${n}`);

  // 按日期汇总
  const byDate = {};
  for (const r of results) {
    const dt = r.created_at.slice(0, 10);
    byDate[dt] = (byDate[dt] || 0) + 1;
  }
  console.log("\n=== 按日期汇总 ===");
  for (const [dt, n] of Object.entries(byDate).sort()) console.log(`   ${dt}  ${n} 条`);

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
