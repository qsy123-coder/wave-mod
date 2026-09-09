/**
 * 用每日期文件夹里的「分享结果导出」xlsx（daily-xunlei.json）为数据源，
 * 对每日 exe 文件名做精确/前缀匹配，得到 文件→迅雷链接 的映射。
 * 数据源里的分享名与 exe 文件几乎同形（版本/括号差异已体现在分享名里），
 * 所以直接对比即可，无需去版本/去作者。
 * 匹配分级：
 *   exact      完全相等(去.exe + trim)
 *   prefix     以文件名开头 或 文件名以分享名开头（长度差兜底）
 *   norm       去括号+去版本+去作者 后相等
 * 输出：逐文件 映射，供人工确认后写库。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "D:/BaiduNetdiskDownload/MC-MOD整合包/wMOD全集-每日更新/A_每日更新";
const DATA = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-xunlei.json";
const REPORT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-match-v3.json";

const recs = JSON.parse(readFileSync(DATA, "utf8")).filter((r) => r.name && r.name !== "分享名" && /^https?:\/\//.test(r.link || ""));
const clean = (s) => (s || "").replace(/\.exe$/i, "").trim();
const norm = (s) => (s || "").toLowerCase()
  .replace(/\.exe$/i, "")
  .replace(/[（(【\[].*?[)）】\]]/g, "")
  .replace(/[\s\-—－:：,，.。·]+/g, "");

// 索引：按分享名 clean + norm 存多条
const byClean = new Map();
const byNorm = new Map();
for (const r of recs) {
  const c = clean(r.name);
  if (!c) continue;
  const arr = byClean.get(c) || []; arr.push(r); byClean.set(c, arr);
  const n = norm(c);
  const arrN = byNorm.get(n) || []; arrN.push(r); byNorm.set(n, arrN);
}

const files = [];
for (const d of readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || !/^W-/.test(d.name)) continue;
  for (const f of readdirSync(join(BASE, d.name))) {
    if (!f.endsWith(".exe")) continue;
    files.push({ name: clean(f), dir: d.name });
  }
}

function dedup(rs) {
  const seen = new Set(); const out = [];
  for (const r of rs) {
    if (r.name === "分享名" || seen.has(r.name)) continue;
    seen.add(r.name); out.push(r);
  }
  return out;
}

const results = [];
for (const f of files) {
  const c = f.name;
  const n = norm(c);
  let matches = [];
  let grade = null;
  if (byClean.has(c)) { grade = "exact"; matches = byClean.get(c); }
  else if (byNorm.has(n)) { grade = "norm"; matches = byNorm.get(n); }
  else {
    // 前缀：文件名开头==分享名开头(≥6字) 或 分享名包含文件名
    for (const r of recs) {
      const rc = clean(r.name);
      if (rc.length < 6 || c.length < 4) continue;
      if (c.startsWith(rc) || rc.startsWith(c)) {
        matches.push(r);
        if (!grade) grade = "prefix";
      }
    }
  }
  const uniq = dedup(matches);
  results.push({ dir: f.dir, name: c, grade, recs: uniq.map((r) => ({ xunlei: r.name, link: r.link, pwd: r.pwd, date: r.date })) });
}

const hit = results.filter((r) => r.recs.length > 0);
const none = results.filter((r) => r.recs.length === 0);

writeFileSync(REPORT, JSON.stringify({ hit, none: none.map((r) => r.name) }, null, 2), "utf8");

console.log(`📥 每日文件 ${files.length} | 数据源记录 ${recs.length} | 命中 ${hit.length} | 未命中 ${none.length}\n`);

console.log("===== 🎯 命中 =====");
for (const r of hit) {
  console.log(`[${r.dir}] ${r.name}`);
  console.log(`   ${r.grade} | ${r.recs.length} 条`);
  r.recs.forEach((m) => console.log(`     ${m.xunlei}\n     → ${m.link}`));
  console.log("");
}

console.log(`===== ❌ 未命中（${none.length}） =====`);
for (const r of none) console.log(`[${r.dir}] ${r.name}`);

console.log(`\n📄 报告: ${REPORT}`);
