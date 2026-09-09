/**
 * 严谨迅雷匹配 v3 —— 方向：按「缺迅雷的库内 mod」逐个到 xunlei-map 里找其链接。
 * 每个 mod 已知 character，用它（含变体）作为 xunlei 名的角色前缀去 strip，剩余标题与库内 title 完全相等才算命中。
 * 这样角色是给定的 → 不会出现跨角色同名冲突。
 * 输出 candidates（可能 0/1/多条不同链接），--apply 只在唯一命中时写库。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/strict-match-report.json";
const isApply = process.argv.includes("--apply");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const map = JSON.parse(readFileSync(MAP_PATH, "utf8")).filter((r) => r.link && r.link.startsWith("http"));
for (const r of map) r._name = r.name.replace(/\.exe$/i, "").trim();

// 去括号/空白/分隔 → 小写
const norm = (s) => (s || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-—－:：,，.。]+/g, "");

// 变体角色名 → 标准
const CHAR_VARIANTS = { "爱弥丝": "爱弥斯", "坎特雷拉": "坎特蕾拉", "洛瑟拉": "洛瑟菈", "清霄": "清宵" };
const canonChar = (c) => CHAR_VARIANTS[c] || c;
// 每个标准角色名可用的全部前缀（标准名 + 变体名）
const PREFIXES = {};
for (const [alias, std] of Object.entries(CHAR_VARIANTS)) { (PREFIXES[std] ||= []).push(alias); }
function prefixesOf(stdChar) { return [stdChar, ...(PREFIXES[stdChar] || [])]; }

// ===== 库内 mod（带 drive_links）=====
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
console.log(`📥 xunlei 记录 ${map.length}  |  🗄 库内 ${dbMods.length}  |  ❌ 缺迅雷 ${missing.length}\n`);

// 预计算：每个 mod 的标题 norm
for (const m of missing) m._titleNorm = norm(m.title);

// ===== 为每个缺失 mod 找匹配 =====
const results = []; // { mod, cands: [{xunleiName, link}], matched: bool }
for (const m of missing) {
  const cands = [];
  const char = String(m.character).trim();
  for (const r of map) {
    // 尝试该 mod 的每个角色前缀
    let strip = null;
    for (const p of prefixesOf(char)) {
      if (!r._name.startsWith(p)) continue;
      let rest = r._name.slice(p.length);
      rest = rest.replace(/^[（(][^）)]*[)）]/, "");
      rest = rest.replace(/^[-－\s:：,，.]+/, "");
      strip = rest;
      break;
    }
    // 无前缀则整名
    const target = strip !== null ? strip : r._name;
    if (strip === null) {
      // 若整名 == titleNorm
      if (norm(target) === m._titleNorm) cands.push({ xunleiName: r._name, link: r.link });
      continue;
    }
    if (norm(strip) === m._titleNorm) cands.push({ xunleiName: r._name, link: r.link });
  }
  // 去重链接
  const linkMap = new Map();
  for (const c of cands) if (!linkMap.has(c.link)) linkMap.set(c.link, c);
  results.push({ mod: m, cands: [...linkMap.values()] });
}

const withCand = results.filter((r) => r.cands.length > 0);
const noCand = results.filter((r) => r.cands.length === 0);
const single = withCand.filter((r) => r.cands.length === 1);
const multi = withCand.filter((r) => r.cands.length > 1);

console.log(`🎯 有匹配: ${withCand.length}  (唯一 ${single.length} / 多链接 ${multi.length})  |  ❌ 无匹配: ${noCand.length}\n`);

console.log(`===== 🎯 唯一命中（可直接补，${single.length}） =====`);
for (const r of single) console.log(`[${r.mod.character}] ${r.mod.title}  → ${r.cands[0].link}`);

console.log(`\n===== 🔶 多链接命中（需你选一条，${multi.length}） =====`);
for (const r of multi) {
  console.log(`[${r.mod.character}] ${r.mod.title}`);
  for (const c of r.cands) console.log(`   ${c.xunleiName}  → ${c.link}`);
}

console.log(`\n===== ❌ 无匹配（${noCand.length}） =====`);
for (const r of noCand) console.log(`[${r.mod.character}] ${r.mod.title}`);

writeFileSync(REPORT_PATH, JSON.stringify({
  single: single.map((r) => ({ character: r.mod.character, title: r.mod.title, link: r.cands[0].link })),
  multi: multi.map((r) => ({ character: r.mod.character, title: r.mod.title, cands: r.cands.map((c) => ({ xunleiName: c.xunleiName, link: c.link })) })),
  noCand: noCand.map((r) => ({ character: r.mod.character, title: r.mod.title })),
}, null, 2), "utf8");
console.log(`\n📄 报告: ${REPORT_PATH}`);

if (!isApply) { console.log("\n🔍 DRY-RUN: 未写库。确认后用 --apply 写唯一命中的。"); process.exit(0); }

async function apply() {
  console.log(`\n💾 写库（仅唯一命中 ${single.length} 条）...`);
  let ok = 0, fail = 0;
  for (const r of single) {
    const cur = r.mod.drive_links || [];
    if (cur.some((d) => String(d.platform).includes("迅雷"))) continue;
    const next = [...cur, { platform: "迅雷网盘", url: r.cands[0].link }];
    const { error } = await supabase.from("mods").update({ drive_links: next }).eq("id", r.mod.id);
    if (error) { fail++; console.error(`  ❌ ${r.mod.title}: ${error.message}`); }
    else { ok++; console.log(`  ✅ [${r.mod.character}] ${r.mod.title}`); }
  }
  console.log(`\n📊 成功 ${ok}，失败 ${fail}`);
}
apply();
