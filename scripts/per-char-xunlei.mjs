/**
 * 按角色视角匹配：对每个缺迅雷的 mod，去 xunlei-map 里找「该角色名下」的所有条目，
 * 用宽松相似度（角色前缀剥离后与 title 的相似）评分，圈出候选。
 * 只考虑角色前缀 == 库内 character 的迅雷条目，避免跨角色同名混淆。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/per-char-report.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const map = JSON.parse(readFileSync(MAP_PATH, "utf8")).filter((r) => r.link && r.link.startsWith("http"));
for (const r of map) r._name = r.name.replace(/\.exe$/i, "").trim();

const normLoose = (s) => (s || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-—－:：,，.。·]+/g, "");
// 角色名从 xunlei 名开头剥离
function stripPrefix(raw, char) {
  for (const p of [char]) {
    if (raw.startsWith(p)) {
      let rest = raw.slice(p.length);
      rest = rest.replace(/^[（(][^）)]*[)）]/, "").replace(/^[-－\s:：,，.]+/, "");
      return rest;
    }
  }
  return null;
}
// 相似度：最长公共子串长度比
function similarity(a, b) {
  if (a === b) return 1;
  const [A, B] = a.length >= b.length ? [a, b] : [b, a];
  let best = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = i + 1; j <= A.length; j++) {
      const sub = A.slice(i, j);
      const idx = B.indexOf(sub);
      if (idx !== -1 && sub.length > best) best = sub.length;
    }
  }
  return best / A.length;
}

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

const results = [];
for (const m of missing) {
  const char = String(m.character).trim();
  const tL = normLoose(m.title);
  const cands = [];
  for (const r of map) {
    const strip = stripPrefix(r._name, char);
    if (strip === null) continue; // 只认同角色前缀
    const sL = normLoose(strip);
    const sim = similarity(tL, sL);
    if (sim >= 0.5) cands.push({ xunleiName: r._name, link: r.link, sim: +sim.toFixed(3), strip });
  }
  cands.sort((a, b) => b.sim - a.sim);
  results.push({ mod: m, cands });
}

const hasCandidate = results.filter((r) => r.cands.length > 0).sort((a, b) => b.cands[0].sim - a.cands[0].sim);
const none = results.filter((r) => r.cands.length === 0);

console.log(`缺迅雷 ${missing.length} | 同角色下相似 ≥0.5 有候选 ${hasCandidate.length} | 无 ${none.length}\n`);

writeFileSync(REPORT_PATH, JSON.stringify({
  hasCandidate: hasCandidate.map((r) => ({ character: r.mod.character, title: r.mod.title, cands: r.cands.slice(0, 5) })),
  none: none.map((r) => ({ character: r.mod.character, title: r.mod.title })),
}, null, 2), "utf8");

console.log("===== 🎯 同角色候选（按相似度降序） =====");
for (const r of hasCandidate) {
  console.log(`[${r.mod.character}] ${r.mod.title}`);
  r.cands.slice(0, 3).forEach((c) => console.log(`   sim=${c.sim} | ${c.xunleiName}`));
  if (r.cands.length > 3) console.log(`   (还有 ${r.cands.length - 3} 个)`);
  console.log("");
}

console.log(`===== ❌ 同角色下无候选（${none.length}） =====`);
for (const r of none) console.log(`[${r.mod.character}] ${r.mod.title}`);
console.log(`\n📄 报告: ${REPORT_PATH}`);
