import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";

const CSV_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\第三轮导出csv仅仅夸克`;
const IMG_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\整理文件夹`;

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
        if (endIdx !== -1) { contentLines.push(cl.slice(0, endIdx)); rest = cl.slice(endIdx + 2); break; }
        if (cl.endsWith('"')) { contentLines.push(cl.slice(0, -1)); i++; rest = lines[i]?.trim() || ""; break; }
        contentLines.push(cl); i++; if (i >= lines.length) break; rest = lines[i];
      }
      shareContent = contentLines.join("\n");
    } else {
      const nextComma = rest.indexOf(",");
      if (nextComma !== -1) { shareContent = rest.slice(0, nextComma); rest = rest.slice(nextComma + 1); }
      else { shareContent = rest; rest = ""; }
    }
    const urlMatch = shareContent.match(/https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?pwd=[^&\s]+)?/);
    const url = urlMatch ? urlMatch[0] : "";
    const filename = shareName.trim();
    const key = filename.replace(/\.exe$/i, "");
    if (key && url) records.push(key);
    i++;
  }
  return records;
}

const csvFiles = readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv"));
let keys = [];
for (const f of csvFiles) keys = keys.concat(parseQuarkCsv(join(CSV_DIR, f)));

// 全局图片索引
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const map = new Map();
function walk(dir) {
  if (!existsSync(dir)) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const base = basename(e.name, ext);
      if (!map.has(base)) map.set(base, full);
    }
  }
}
walk(IMG_DIR);

// 列出缺图的 key
const missing = keys.filter((k) => !map.has(k));
console.log(`CSV keys: ${keys.length}, 缺图: ${missing.length}\n`);

// 按前缀分组
const groups = {};
for (const k of missing) {
  const dash = k.indexOf("-");
  const prefix = dash === -1 ? k : k.slice(0, dash);
  if (!groups[prefix]) groups[prefix] = [];
  groups[prefix].push(k);
}
for (const [prefix, ks] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n[${prefix}] ${ks.length} 个:`);
  ks.slice(0, 30).forEach((k) => console.log("   " + k));
}

// 检查是否存在任何 "男漂-" 开头的图片
console.log("\n\n=== 图片索引中以 男漂 / 男主 开头的数量 ===");
let nanshu = 0, nanpiao = 0;
for (const base of map.keys()) {
  if (base.startsWith("男主")) nanshu++;
  if (base.startsWith("男漂")) nanpiao++;
}
console.log(`男主-* 图片: ${nanshu}`);
console.log(`男漂-* 图片: ${nanpiao}`);
const nanpiaoImgs = [...map.keys()].filter((k) => k.startsWith("男漂"));
console.log("男漂-* 图片样例:", nanpiaoImgs.slice(0, 10));
