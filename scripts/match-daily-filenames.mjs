/**
 * 用每日更新目录的完整 exe 文件名去 xunlei-map 宽松匹配。
 * 这是与迅雷分享名最接近的形式（带角色前缀）。
 * 宽松规则：去括号 + 去空白/常见分隔 + 小写后比较，或包含。
 * 输出：每个文件名的最佳 xunlei 匹配 + 差距，供人工确认。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "D:/BaiduNetdiskDownload/MC-MOD整合包/wMOD全集-每日更新/A_每日更新";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-file-match.json";

const map = JSON.parse(readFileSync(MAP_PATH, "utf8")).filter((r) => r.link && r.link.startsWith("http"));
const xNames = new Set(map.map((r) => r.name.replace(/\.exe$/i, "").trim()));

// 收集每日更新所有 exe 文件名（去 .exe）
const files = [];
for (const d of readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || !/^W-/.test(d.name)) continue;
  for (const f of readdirSync(join(BASE, d.name))) {
    if (!f.endsWith(".exe")) continue;
    files.push({ name: f.replace(/\.exe$/i, "").trim(), dir: d.name });
  }
}

// 宽松归一
const norm = (s) => (s || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-—－:：,，.。·]+/g, "");

const results = [];
for (const f of files) {
  const fn = norm(f.name);
  const candidates = [];
  for (const r of map) {
    const mn = norm(r.name.replace(/\.exe$/i, ""));
    if (!mn) continue;
    let grade = null; let score = 0;
    if (mn === fn) { grade = "精确"; score = 100; }
    else if (mn.includes(fn) && fn.length >= 4) { grade = "清单含文件名"; score = 80; }
    else if (fn.includes(mn) && mn.length >= 4) { grade = "文件名含清单"; score = 78; }
    if (grade) candidates.push({ xunlei: r.name, link: r.link, grade, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  results.push({ name: f.name, dir: f.dir, best: candidates[0] || null, all: candidates });
}

const hit = results.filter((r) => r.best);
const none = results.filter((r) => !r.best);

console.log(`📥 每日更新 exe 文件 ${files.length} | xunlei 记录 ${map.length} | 有匹配 ${hit.length} | 无匹配 ${none.length}\n`);

writeFileSync(REPORT_PATH, JSON.stringify({ hit, none: none.map((r) => r.name) }, null, 2), "utf8");

console.log("===== 🎯 有匹配 =====");
for (const r of hit) {
  console.log(`[${r.dir}] ${r.name}`);
  console.log(`   ${r.best.grade} | ${r.best.xunlei}`);
  console.log(`   → ${r.best.link}\n`);
}

console.log("===== ❌ 无匹配 =====");
for (const r of none) console.log(`[${r.dir}] ${r.name}`);

console.log(`\n📄 报告: ${REPORT_PATH}`);
