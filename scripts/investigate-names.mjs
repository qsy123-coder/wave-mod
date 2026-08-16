import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
    const remainingParts = rest.split(",");
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

// 打印所有包含特殊前缀的 key
const targets = ["男主", "男漂", "炽霞", "皮肤", "赤霞", "黑咩", "特效修改", "羊咩", "宠物", "夏洛特", "眼罩", "折纸伞", "渊舞", "渊武", "含皮肤"];
console.log("=== 特殊前缀 sample keys ===");
for (const t of targets) {
  const matched = keys.filter((k) => k.includes(t));
  if (matched.length === 0) continue;
  console.log(`\n[${t}] 共 ${matched.length} 个:`);
  matched.slice(0, 12).forEach((k) => console.log("   " + k));
}

// 打印 男漂 与 赤霞 图片文件夹的样例文件名
console.log("\n\n=== 男漂 图片文件夹 (前 40) ===");
const nandir = join(IMG_DIR, "男漂");
if (existsSync(nandir)) readdirSync(nandir).slice(0, 40).forEach((n) => console.log("   " + n));

console.log("\n=== 赤霞 图片文件夹 (前 40) ===");
const chixdir = join(IMG_DIR, "赤霞");
if (existsSync(chixdir)) readdirSync(chixdir).slice(0, 40).forEach((n) => console.log("   " + n));

console.log("\n=== 长离 图片文件夹 (后 15，看皮肤/眼罩/折纸伞) ===");
const changl = join(IMG_DIR, "长离");
if (existsSync(changl)) {
  const all = readdirSync(changl);
  all.filter((n) => /皮肤|眼罩|折纸|桂枝|宁芙/.test(n)).forEach((n) => console.log("   " + n));
}
