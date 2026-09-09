/**
 * 解析 A_每日更新 各日期文件夹里的「分享结果导出-*.xlsx」（迅雷网盘分享记录）。
 * 结构：ZIP 内含 xl/sharedStrings.xml + xl/worksheets/sheet1.xml。
 * 输出：合并所有日期 → daily-xunlei.json（含 date / name / link / pwd）。
 */
import { readFileSync, readdirSync, readdirSync as rd, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

const BASE = "D:/BaiduNetdiskDownload/MC-MOD整合包/wMOD全集-每日更新/A_每日更新";
const OUT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-xunlei.json";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

function parseXlsx(buf) {
  return JSZip.loadAsync(buf).then(async (zip) => {
    const ssXml = await zip.file("xl/sharedStrings.xml").async("string");
    const wsXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
    const ss = parser.parse(ssXml);
    const ws = parser.parse(wsXml);
    const strings = [];
    const si = ss?.sst?.si;
    if (Array.isArray(si)) {
      for (const s of si) {
        if (typeof s.t === "string") strings.push(s.t);
        else if (s.t && typeof s.t["#text"] === "string") strings.push(s.t["#text"]);
      }
    } else if (si?.t) {
      strings.push(typeof si.t === "string" ? si.t : si.t["#text"]);
    }
    const rows = ws?.worksheet?.sheetData?.row;
    const out = [];
    const list = Array.isArray(rows) ? rows : [rows];
    for (const row of list) {
      if (!row?.c) continue;
      const cells = Array.isArray(row.c) ? row.c : [row.c];
      const vals = cells.map((c) => {
        const v = c?.v;
        const t = c?.["@_t"];
        if (t === "s" && v != null) return strings[Number(v)] ?? "";
        return v != null ? String(v) : "";
      });
      if (vals.length >= 2 && /^https?:\/\//.test(vals[1] || "")) {
        out.push({ name: (vals[0] || "").trim(), link: (vals[1] || "").trim(), pwd: vals[3] || vals[2] || "" });
      }
    }
    return out;
  });
}

async function main() {
  const all = [];
  const dirs = rd(BASE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^W-/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const d of dirs) {
    const dir = join(BASE, d.name);
    const xlsx = rd(dir).find((f) => /分享结果导出-.*\.xlsx$/.test(f));
    if (!xlsx) { console.log(`[${d.name}] ❌ 无 xlsx`); continue; }
    const recs = await parseXlsx(readFileSync(join(dir, xlsx)));
    all.push(...recs.map((r) => ({ ...r, date: d.name })));
    console.log(`[${d.name}] ${xlsx} → ${recs.length} 条`);
  }
  writeFileSync(OUT, JSON.stringify(all, null, 2), "utf8");
  console.log(`\n📄 总计 ${all.length} 条 → ${OUT}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
