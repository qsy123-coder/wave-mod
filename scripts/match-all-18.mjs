/**
 * 对当前库里 18 个缺迅雷 mod 做「字符感知」的模糊匹配，跨 bulk map + daily。
 * 输出：每个 mod 的候选 xunlei(名称+链接+pwd)，按评分排序。只读不写。
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

const map = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json", "utf8")).filter((r) => r.link && r.link.startsWith("http"));
const daily = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-xunlei.json", "utf8"));
const all = [...map.map((r) => ({ ...r, src: "bulk" })), ...daily.map((r) => ({ ...r, src: "daily" }))];

// 角色别名（库内/文件名异体 → 标准）
const CHAR = {
  "女主":"女漂","男主角":"男漂","男主":"男漂","洛瑟拉":"洛瑟菈","坎特雷拉":"坎特蕾拉",
  "清霄":"清宵","渊舞":"渊武","爱弥丝":"爱弥斯","千咲皮肤":"千咲","琳奈皮肤":"琳奈",
  "滑翔翼,翱翔翼,科考摩托":"滑翔翼","科考摩托":"滑翔翼","翱翔翼":"滑翔翼",
};

const norm = (s) => (s || "").toLowerCase()
  .replace(/\.exe$/i, "")
  .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, "")
  .replace(/by\s+\S+.*$/i, "")
  .replace(/[\s\-—－:：,，.。·'’"“”~_]+/g, "");

const db = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("mods").select("id,title,character,drive_links").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  db.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
const hasXl = (l) => Array.isArray(l) && l.some((d) => String(d.platform||"").includes("迅雷"));
const missing = db.filter((m) => !hasXl(m.drive_links));

console.log(`库内 ${db.length} | 缺迅雷 ${missing.length}\n`);
for (const m of missing) {
  const tN = norm(m.title);
  const char = (CHAR[m.character] || m.character || "").toLowerCase();
  const scored = [];
  for (const r of all) {
    const name = r.name.replace(/\.exe$/i, "");
    const nN = norm(name);
    // 角色是否一致：取文件名第一个「-」前 & 库 character
    const fHead = (name.split(/[-－]/)[0] || "").trim();
    const fChar = (CHAR[fHead] || fHead || "").toLowerCase();
    const charMatch = char && fChar && (char === fChar || char.includes(fChar) || fChar.includes(char));
    let score = 0;
    if (nN && tN) {
      if (nN === tN) score = 100;
      else if (nN.length >= 4 && (nN.includes(tN) || tN.includes(nN))) score = 70 + Math.min(nN.length,tN.length);
      else if (charMatch) score = 55;
    }
    if (score > 0 && charMatch) score += 8;
    if (score > 0) scored.push({ name, link: r.link, pwd: r.pwd, src: r.src, score });
  }
  scored.sort((a,b)=>b.score-a.score);
  const top = scored.slice(0,3);
  console.log(`▶ [${m.character}] ${m.title}`);
  if (!top.length) { console.log("   ❌ 无候选"); continue; }
  for (const c of top) console.log(`   [${c.score}][${c.src}] ${c.name}\n       → ${c.link} ${c.pwd?("pwd="+c.pwd):""}`);
  console.log("");
}
