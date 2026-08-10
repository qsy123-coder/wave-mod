import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MODS_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新`;

function parseQuarkCsvRaw(content) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i+1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field.trim()); field = ""; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && content[i+1] === '\n') i++;
        if (row.length > 0 || field) { row.push(field.trim()); if (row.length >= 4) rows.push(row); row = []; field = ""; }
      } else field += ch;
    }
  }
  if (row.length > 0 || field) { row.push(field.trim()); if (row.length >= 4) rows.push(row); }
  return rows;
}

const folders = readdirSync(MODS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
let total = 0;
let totalUnique = 0;
for (const f of folders) {
  const charDir = join(MODS_DIR, f.name);
  const csvs = readdirSync(charDir, { withFileTypes: true })
    .filter(fn => fn.isFile() && fn.name.startsWith("分享结果导出-") && fn.name.endsWith(".csv"));
  if (csvs.length === 0) continue;

  const seen = new Set();
  let count = 0;
  for (const csv of csvs) {
    const rows = parseQuarkCsvRaw(readFileSync(join(charDir, csv.name), "utf-8"));
    for (const r of rows) {
      const key = r[1]?.trim().replace(/\.exe$/i, "");
      if (key && !seen.has(key)) {
        seen.add(key);
        count++;
      }
    }
  }
  console.log(f.name + ": " + count);
  totalUnique += count;
  total += Array.from(seen).length;
}
console.log("Total unique CSV mods: " + totalUnique);
