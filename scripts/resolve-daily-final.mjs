/**
 * 最终裁决：每日文件 → 唯一库内 mod → 迅雷链接。
 * 对每个每日文件：
 *   1. 从文件名提取角色（带别名/异体字），记录 charField。
 *   2. 候选库 mod：title 归一化后与「文件名去角色前缀部分」尽量一致。
 *   3. 判定标准：
 *      - 首选：候选里 character 与文件名角色一致者（含别名映射）。
 *      - 若仍歧义或为空，再按最长公共子串/包含分。
 * 输出精简到 每个文件一个 modId+link，写 report 供确认。
 * 此脚本不写库。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MATCH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-match-v3.json";
const REPORT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-final.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { hit } = JSON.parse(readFileSync(MATCH, "utf8"));

const db = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("mods").select("id, title, character, drive_links").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  db.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}

const norm = (s) => (s || "").toLowerCase()
  .replace(/\.exe$/i, "")
  .replace(/[（(【\[].*?[)）】\]]/g, "")
  .replace(/[\s\-—－:：,，.。·]+/g, "");

// 角色别名 → 库内 character 可能写法
const CHAR_ALIAS = {
  "女主": "女漂", "女主角": "女漂", "男主": "男漂", "洛瑟拉": "洛瑟菈",
  "坎特雷拉": "坎特蕾拉", "洛瑟菈": "洛瑟菈", "清霄": "清宵",
  "爱弥丝": "爱弥斯", "千咲皮肤": "千咲", "琳奈皮肤": "琳奈",
};
const aliasMatch = (a, b) => {
  if (a === b) return true;
  const ga = CHAR_ALIAS[a] || a, gb = CHAR_ALIAS[b] || b;
  return ga === gb;
};

function charOf(filename) {
  // 从文件名第一个「-」前的片段提取角色（去皮肤括号），常见前缀
  const head = (filename || "").split(/[-－]/)[0];
  return (head || "").replace(/[（(【\[]{1}[^）)】\]]*[）)】\]]{1}$/, "").trim();
}

const results = [];
for (const f of hit) {
  const tL = norm(f.name);
  const fChar = charOf(f.name);
  const xunlei = f.recs[0];

  // 候选：title 归一 == 文件名归一 或 包含
  let cands = [];
  for (const m of db) {
    const mk = norm(m.title);
    if (!mk || mk.length < 2) continue;
    if (mk === tL) cands.push({ m, score: 100 });
    else if (mk.length >= 4 && (tL.includes(mk) || mk.includes(tL))) cands.push({ m, score: 70 + Math.min(mk.length, tL.length) });
  }
  // 去重
  const seen = new Set(); const uniq = [];
  for (const c of cands) { if (!seen.has(c.m.id)) { seen.add(c.m.id); uniq.push(c); } }
  uniq.sort((a, b) => b.score - a.score);

  // 首选相同角色
  let chosen = uniq.find((c) => aliasMatch(c.m.character, fChar)) || null;
  let pick = chosen || uniq[0] || null;

  const status = pick ?
    (chosen ? (cands.length === 1 ? "UNIQUE" : "CHAR_MATCH") : "TITLE_MATCH") :
    "NO_MATCH";
  const hasXl = Array.isArray(pick?.m.drive_links) && pick.m.drive_links.some((d) => String(d.platform).includes("迅雷"));
  results.push({
    filename: f.name,
    dir: f.dir,
    fChar,
    modId: pick?.m.id || null,
    modTitle: pick?.m.title || null,
    character: pick?.m.character || null,
    link: xunlei.link,
    pwd: xunlei.pwd,
    xunleiName: xunlei.xunlei,
    status: pick ? (hasXl ? "ALREADY" : status) : "NO_MATCH",
    alt: uniq.slice(0, 5).map((c) => `${c.m.character}|${c.m.title}`),
  });
}

writeFileSync(REPORT, JSON.stringify(results, null, 2), "utf8");

const ok = results.filter((r) => r.status === "UNIQUE" || r.status === "CHAR_MATCH" || r.status === "TITLE_MATCH");
console.log(`🗄  库内 ${db.length} | 每日 ${hit.length}\n`);
console.log(`✅ 待补链接: ${ok.length}`);
console.log(`⏭️  已有迅雷: ${results.filter((r) => r.status === "ALREADY").length}`);
console.log(`❌ 无匹配: ${results.filter((r) => r.status === "NO_MATCH").length}\n`);

console.log("===== ✅ 待补 =====");
for (const r of ok) {
  console.log(`  [${r.status}] ${r.filename}`);
  console.log(`     → ${r.modTitle} (${r.character})`);
  console.log(`     → ${r.link}`);
}
console.log("\n===== ⏭️ 已有迅雷 =====");
for (const r of results.filter((x) => x.status === "ALREADY")) console.log(`  ${r.filename} → ${r.modTitle}`);
console.log("\n===== ❌ 无匹配 =====");
for (const r of results.filter((x) => x.status === "NO_MATCH")) console.log(`  ${r.filename}  (char=${r.fChar})  alt=${JSON.stringify(r.alt)}`);
console.log(`\n📄 报告: ${REPORT}`);
