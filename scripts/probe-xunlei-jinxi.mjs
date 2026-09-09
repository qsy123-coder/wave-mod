/**
 * 临时：今汐类未匹配记录 → 按"库内唯一候选 / 多角色候选 / 无候选"分类，输出可确认清单。
 * 标题去括号后精确匹配库内任意角色。只读。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const r = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-report.json", "utf8"));

const dbMods = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("mods").select("id, title, character").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  dbMods.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
const noBr = (s) => (s || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/\s+/g, "");

function stripPrefix(name) {
  let s = name.replace(/\.exe$/i, "").trim();
  s = s.replace(/^今汐/, "");
  s = s.replace(/^(特效修改|皮肤\{?[^)\]]*\}?\]?|龙角|皮肤)/, "");
  s = s.replace(/^[-－\s，.,:]+/, "");
  return s;
}

const rows = r.unmatched.filter((u) => /^今汐/.test(u.name));

const idx = new Map();
for (const d of dbMods) {
  const k = noBr(d.title);
  if (!idx.has(k)) idx.set(k, []);
  idx.get(k).push(d);
}

const unique = []; const multi = []; const none = [];
for (const u of rows) {
  const termRaw = stripPrefix(u.name);
  const term = noBr(termRaw);
  const cands = term && idx.has(term) ? idx.get(term) : [];
  const details = [...new Set(cands.map((d) => `${d.character}｜${d.title}`))];
  const rec = { name: u.name, term: termRaw, link: u.link, details };
  if (details.length === 0) none.push(rec);
  else if (details.length === 1) unique.push(rec);
  else multi.push(rec);
}

console.log(`今汐未匹配 ${rows.length} 条 →  库内唯一候选 ${unique.length}，多角色候选 ${multi.length}，无候选(未入库) ${none.length}。\n`);

const show = (title, list, limit) => {
  console.log(`===== ${title} (${list.length}) =====`);
  for (const l of list.slice(0, limit)) {
    console.log(`【${l.term}】 ${l.link}`);
    l.details.forEach((d) => console.log(`     · ${d}`));
    if (l.details.length === 1) console.log(`     → 候选唯一: ${l.details[0]}`);
    console.log("");
  }
  if (list.length > limit) console.log(`  …还有 ${list.length - limit} 条，见文件\n`);
};

show("库内唯一候选（可直接补链接，需你点头）", unique, 20);
show("多角色候选（需你指明角色）", multi, 20);
show("无候选（未入库，跳过/新建待定）", none, 0);
