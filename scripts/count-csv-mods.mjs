import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MODS_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新`;

/** Parse CSV content handling quoted fields with embedded newlines */
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field.trim()); field = ""; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && content[i + 1] === '\n') i++;
        if (row.length > 0 || field) {
          row.push(field.trim());
          if (row.length >= 4) rows.push(row);
          row = [];
          field = "";
        }
      }
      else { field += ch; }
    }
  }
  if (row.length > 0 || field) { row.push(field.trim()); if (row.length >= 4) rows.push(row); }
  return rows;
}

/** Recursively count files by extension */
function countFilesRecursive(basePath, extensions) {
  let count = 0;
  try {
    const entries = readdirSync(basePath, { withFileTypes: true });
    for (const e of entries) {
      const full = join(basePath, e.name);
      if (e.isDirectory()) {
        count += countFilesRecursive(full, extensions);
      } else if (e.isFile()) {
        const ext = e.name.split('.').pop()?.toLowerCase();
        if (extensions.includes(ext)) count++;
      }
    }
  } catch {}
  return count;
}

const folders = readdirSync(MODS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
const results = [];
for (const f of folders) {
  const charDir = join(MODS_DIR, f.name);
  const files = readdirSync(charDir).filter(fn => fn.endsWith(".csv"));
  if (files.length === 0) continue;
  let totalMods = 0;
  for (const csv of files) {
    const content = readFileSync(join(charDir, csv), "utf-8");
    const rows = parseCsv(content);
    totalMods += rows.length;
  }
  // Count preview images and mod files recursively
  const images = countFilesRecursive(charDir, ["png", "jpg", "jpeg", "webp", "gif"]);
  const exes = countFilesRecursive(charDir, ["exe"]);
  results.push({ char: f.name, mods: totalMods, images, exes });
}

results.sort((a, b) => b.mods - a.mods);
let grandTotal = 0;
console.log("角色".padEnd(26) + "Mods".padEnd(8) + "预览图".padEnd(8) + "exe");
console.log("-".repeat(54));
for (const r of results) {
  console.log(r.char.padEnd(26) + String(r.mods).padEnd(8) + String(r.images).padEnd(8) + String(r.exes));
  grandTotal += r.mods;
}
console.log("");
console.log("总计: " + grandTotal + " 个 Mod");
