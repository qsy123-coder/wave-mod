import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const CSV_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\第三轮导出csv仅仅夸克`;

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

// 散华相关：以 "散华" 开头的 key
const sanhuaKeys = keys.filter((k) => k.startsWith("散华"));
console.log(`CSV 散华相关记录: ${sanhuaKeys.length}`);

// 解析 title（去掉 "散华" 前缀 + 分隔符）
function titleOf(key) {
  let t = key.slice("散华".length).replace(/^[-－]\s*/, "").trim();
  return t || key;
}

const csvTitles = sanhuaKeys.map(titleOf);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: db, error } = await supabase.from("mods").select("title").eq("game_key", "wuthering-waves").eq("character", "散华");
if (error) { console.error(error); process.exit(1); }
const dbTitles = new Set(db.map((m) => m.title.trim()));
console.log(`DB 散华记录: ${db.size}\n`);

const overlap = csvTitles.filter((t) => dbTitles.has(t));
const neu = csvTitles.filter((t) => !dbTitles.has(t));

console.log(`CSV 散华: ${csvTitles.length}`);
console.log(`已在 DB（跳过）: ${overlap.length}`);
console.log(`新增: ${neu.length}\n`);

console.log("=== 已在 DB（跳过） ===");
overlap.forEach((t) => console.log("  " + t));
console.log("\n=== 新增 ===");
neu.forEach((t) => console.log("  " + t));
