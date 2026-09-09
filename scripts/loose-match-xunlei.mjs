/**
 * 全身宽松匹配：对每个缺迅雷的 mod，在 xunlei-map 里找候选链接。
 * 用多种规范化形式 + 包含/子串/去停用词，尽量召回「对应」的链接。
 * 输出：每个 mod 的 Top 候选（含 xunlei 名 + 链接），供人工确认。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/loose-match-report.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const map = JSON.parse(readFileSync(MAP_PATH, "utf8")).filter((r) => r.link && r.link.startsWith("http"));
for (const r of map) r._name = r.name.replace(/\.exe$/i, "").trim();

// 多种规范化
const stripBracket = (s) => (s || "").replace(/[（(【\[].*?[)）】\]]/g, "");
const stripSpace = (s) => (s || "").replace(/[\s]+/g, "");
const normLoose = (s) => (s || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-—－:：,，.。·]+/g, ""); // 去括号/空白/常见分隔+连字符
const normHard = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); // 仅留字母数字汉字

// 库内缺迅雷 mod
const dbMods = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("mods").select("id, title, character, drive_links").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  dbMods.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
const missing = dbMods.filter((m) => !(m.drive_links || []).some((d) => String(d.platform).includes("迅雷")));

// 索引 xunlei 名多种形式
const xIndex = {
  loose: new Map(), hard: new Map(), noBracket: new Map(),
};
for (const r of map) {
  const push = (m, key, val) => { if (!m.has(key)) m.set(key, []); m.get(key).push(val); };
  push(xIndex.loose, normLoose(r._name), r);
  push(xIndex.hard, normHard(r._name), r);
  push(xIndex.noBracket, stripBracket(stripSpace(r._name)).toLowerCase(), r);
}

function scoreMatch(title, char, r) {
  const tLoose = normLoose(title);
  const tHard = normHard(title);
  const tNoBr = stripBracket(stripSpace(title)).toLowerCase();
  const nLoose = normLoose(r._name);
  const nHard = normHard(r._name);
  const nNoBr = stripBracket(stripSpace(r._name)).toLowerCase();
  // 相同
  if (tLoose === nLoose) return { grade: "A相等", score: 100 };
  if (tHard === nHard) return { grade: "B硬等", score: 95 };
  // 标题(去角色前缀) 在 xunlei 名中 / vice versa
  const tLooseNoChar = normLoose(stripCharPrefix(title, char));
  if (tLooseNoChar && tLooseNoChar === nLoose) return { grade: "C去前缀等", score: 90 };
  if (nLoose.includes(tLoose) && tLoose.length >= 4) return { grade: "D名含标题", score: Math.min(85, 70 + tLoose.length) };
  if (tLoose.includes(nLoose) && nLoose.length >= 4) return { grade: "E标题含名", score: Math.min(85, 70 + nLoose.length) };
  if (tNoBr && nNoBr === tNoBr) return { grade: "F去括号等", score: 80 };
  return null;
}
function stripCharPrefix(title, char) {
  const prefixes = [char].filter(Boolean);
  for (const p of prefixes) {
    if (title.startsWith(p)) return title.slice(p.length);
  }
  return title;
}

const results = [];
for (const m of missing) {
  const cands = [];
  for (const r of map) {
    const s = scoreMatch(m.title, m.character, r);
    if (s) cands.push({ xunleiName: r._name, link: r.link, grade: s.grade, score: s.score });
  }
  cands.sort((a, b) => b.score - a.score);
  results.push({ mod: m, cands });
}

const found = results.filter((r) => r.cands.length > 0).sort((a, b) => b.cands[0].score - a.cands[0].score);
const noFound = results.filter((r) => r.cands.length === 0);

console.log(`📥 xunlei ${map.length} | 缺迅雷 ${missing.length} | 有候选 ${found.length} | 无候选 ${noFound.length}\n`);

writeFileSync(REPORT_PATH, JSON.stringify({
  found: found.map((r) => ({ character: r.mod.character, title: r.mod.title, cands: r.cands.slice(0, 5) })),
  noFound: noFound.map((r) => ({ character: r.mod.character, title: r.mod.title })),
}, null, 2), "utf8");

console.log("===== 🎯 有候选（按分数降序） =====");
for (const r of found) {
  console.log(`[${r.mod.character}] ${r.mod.title}`);
  console.log(`   ${r.cands[0].grade} | score=${r.cands[0].score}`);
  console.log(`   ${r.cands[0].xunleiName}`);
  console.log(`   → ${r.cands[0].link}`);
  if (r.cands.length > 1) console.log(`   (还有 ${r.cands.length - 1} 个候选)`);
  console.log("");
}

console.log(`===== ❌ 无候选（${noFound.length}） =====`);
for (const r of noFound) console.log(`[${r.mod.character}] ${r.mod.title}`);
console.log(`\n📄 报告: ${REPORT_PATH}`);
