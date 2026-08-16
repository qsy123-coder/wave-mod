/**
 * 分析第三轮导出 CSV（夸克）+ 整理文件夹预览图，生成上传前的完整诊断报告。
 * 只读操作，不写入数据库 / 不上传。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const CSV_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\第三轮导出csv仅仅夸克`;
const IMG_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\整理文件夹`;

/** 解析夸克网盘 CSV（含多行引号字段），复用 batch-upload-mod.mjs 逻辑 */
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

// 1. 解析所有 CSV
const csvFiles = readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv"));
let allRecords = [];
for (const f of csvFiles) {
  allRecords = allRecords.concat(parseQuarkCsv(join(CSV_DIR, f)));
}
// 去重（按 key + url）
const seen = new Set();
const unique = [];
for (const r of allRecords) {
  const k = r.key + "|" + r.url;
  if (!seen.has(k)) { seen.add(k); unique.push(r); }
}
console.log(`CSV 文件数: ${csvFiles.length}`);
console.log(`CSV 记录总数: ${allRecords.length}，去重后: ${unique.length}`);

// 2. 提取角色名（分享名第一个 '-' 之前）
// 需要处理特殊前缀: "安可的羊咩", "安可特效修改", "安可黑咩" 等仍属安可；"wu武器" 等
const charStats = {};
for (const r of unique) {
  const dash = r.key.indexOf("-");
  const char = dash === -1 ? r.key : r.key.slice(0, dash);
  if (!charStats[char]) charStats[char] = [];
  charStats[char].push(r);
}

// 3. 整理文件夹角色清单
const imgDirs = readdirSync(IMG_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

console.log(`\n=== 按角色统计 (CSV) ===`);
const rows = Object.entries(charStats).sort((a, b) => b[1].length - a[1].length);
let grandTotal = 0;
for (const [char, mods] of rows) {
  const hasImgDir = imgDirs.includes(char);
  // 匹配图片
  let matched = 0;
  let noImg = 0;
  const imgMap = buildImageMap(char);
  for (const m of mods) {
    if (imgMap.has(m.key)) matched++;
    else noImg++;
  }
  console.log(`${char.padEnd(24)} CSV:${String(mods.length).padStart(4)}  图片目录:${hasImgDir ? "✔" : "✘"}  图匹配:${String(matched).padStart(4)}  缺图:${String(noImg).padStart(4)}`);
  grandTotal += mods.length;
}
console.log(`\n总 mod 数: ${grandTotal}`);

function buildImageMap(char) {
  const dir = join(IMG_DIR, char);
  const map = new Map();
  if (!existsSync(dir)) return map;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return map; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const n = e.name;
    const base = n.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
    map.set(base, n);
  }
  return map;
}

// 4. 查询数据库现有 mods
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ 缺少 Supabase 环境变量");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: dbMods, error: dbErr } = await supabase
  .from("mods")
  .select("title, character")
  .eq("game_key", "wuthering-waves")
  .eq("is_available", true);
if (dbErr) { console.error("DB 查询失败:", dbErr.message); process.exit(1); }

const dbByChar = {};
for (const m of dbMods) {
  if (!dbByChar[m.character]) dbByChar[m.character] = new Set();
  dbByChar[m.character].add(m.title);
}
console.log(`\n数据库现有 mods (game_key=wuthering-waves): ${dbMods.length}`);

console.log(`\n=== 上传前对比: 新增 vs 已存在 ===`);
let totalNew = 0, totalExist = 0;
for (const [char, mods] of rows) {
  const dbSet = dbByChar[char] || new Set();
  // DB 里存的 title 是去掉角色前缀后的；CSV 里是完整文件名。用完整名比较不可靠，改为按 title 归一化比较。
  // 这里只做粗略统计：用 CSV 的 title(去角色前缀) 与 DB title 比较。
  let exist = 0, neu = 0;
  for (const m of mods) {
    const t = m.key.slice(char.length + 1); // 去掉 "角色-" 前缀
    if (dbSet.has(t) || dbSet.has(m.key)) exist++;
    else neu++;
  }
  totalExist += exist;
  totalNew += neu;
  console.log(`${char.padEnd(24)} 已存在:${String(exist).padStart(4)}  新增:${String(neu).padStart(4)}`);
}
console.log(`\n=== 汇总 ===`);
console.log(`去重后 CSV 记录: ${unique.length}`);
console.log(`估计已存在: ${totalExist}`);
console.log(`估计新增: ${totalNew}`);
