/**
 * 诊断：库内缺迅雷链接的 mod → 去 xunlei-map.json 宽松匹配，判断"其实有货但没配上"。
 * 宽松策略（相对 update-xunlei-links.mjs 更包容）：
 *   A. 标题去括号/空白后 == xunlei 名去括号/空白
 *   B. xunlei 名去掉「角色前缀」后 == 标题去括号/空白（角色前缀取库内 character 及别名）
 *   C. 标题整体作为子串出现在 xunlei 名中（去括号+空白后）
 *   D. xunlei 名整体作为子串出现在标题中
 * 命中任一即以「候选」给出，含链接，交由人工确认。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const map = JSON.parse(readFileSync(MAP_PATH, "utf8")).filter((r) => r.link && r.link.startsWith("http"));
console.log(`📥 xunlei-map 有效记录: ${map.length}`);

// xunlei 名去除 .exe
for (const r of map) r._name = r.name.replace(/\.exe$/i, "").trim();

// 归一化：去括号 + 去空白 + 小写
const norm = (s) => (s || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-—－:：,，.。]+/g, "");

// 去角色前缀（含别名）
const CHAR_ALIAS = { "男主": "男漂", "女主": "女漂" };
function stripCharPrefix(raw, dbChar) {
  let label = null;
  if (raw.startsWith(dbChar)) label = dbChar;
  else {
    for (const [alias, target] of Object.entries(CHAR_ALIAS)) {
      if (target === dbChar && raw.startsWith(alias)) { label = alias; break; }
    }
  }
  if (!label) return raw;
  let rest = raw.slice(label.length);
  rest = rest.replace(/^[（(][^）)]*[)）]/, "");
  rest = rest.replace(/^[-－\s:：,，.]+/, "");
  return rest;
}

// 拉库内缺迅雷的 mod
const dbMods = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("mods").select("id, title, character").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  for (const m of data) {
    const arr = (m.drive_links || []); // 未 select，跳过
  }
  dbMods.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
// 重新带 drive_links 拉取（上面没拉）
const missing = [];
let f2 = 0;
while (true) {
  const { data } = await supabase.from("mods").select("id, title, character, drive_links").eq("game_key", GAME_KEY).range(f2, f2 + PAGE - 1);
  if (!data || !data.length) break;
  for (const m of data) {
    const hasX = (m.drive_links || []).some((d) => String(d.platform).includes("迅雷"));
    if (!hasX) missing.push(m);
  }
  if (data.length < PAGE) break;
  f2 += PAGE;
}
console.log(`❌ 库内缺迅雷链接 mod: ${missing.length}\n`);

// 逐条宽松匹配
const found = []; const notFound = [];
for (const m of missing) {
  const char = m.character; const title = m.title || "";
  const t = norm(title);
  const hits = [];
  for (const r of map) {
    const nm = r._name;
    const nnm = norm(nm);
    const nmc = norm(stripCharPrefix(nm, char));
    let rank = null;
    if (t && t === nnm) rank = "A 精确";
    else if (t && nnm && nmc && t === nmc) rank = "B 去角色前缀";
    else if (t && nnm && nnm.includes(t)) rank = "C xunlei含标题";
    else if (t && nnm && t.includes(nnm)) rank = "D 标题含xunlei名";
    if (rank) hits.push({ rank, xunleiName: nm, link: r.link });
  }
  if (hits.length) found.push({ mod: m, hits });
  else notFound.push(m);
}

console.log(`===== 🎯 有候选（可补，${found.length} 条） =====`);
for (const item of found) {
  const m = item.mod;
  console.log(`\n[${m.character}] ${m.title}`);
  const seenRank = new Set();
  for (const h of item.hits) {
    if (seenRank.has(h.rank)) continue; // 同类只留首个
    seenRank.add(h.rank);
    console.log(`   (${h.rank}) 迅雷: ${h.xunleiName}\n   → ${h.link}`);
  }
  if (item.hits.length > 1) console.log(`   (还有 ${item.hits.length} 个候选)`);
}

console.log(`\n\n===== ❌ 真无候选（${notFound.length} 条） =====`);
for (const m of notFound) console.log(`[${m.character}] ${m.title}`);
