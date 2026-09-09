/**
 * DRY-RUN：把每日 xunlei 链接映射到库内 mod。
 * 库内匹配：按 title 反推 —— title = 文件名去掉「角色前缀 + 分隔符」后的部分。
 * 用与 upload-daily 相同的角色前缀与去前缀规则，先从库里拿 title/character/drive_links，
 * 再对每个每日文件生成候选 mod，输出「文件→库 mod→是否已有迅雷→待补链接」。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MATCH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-match-v3.json";
const REPORT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-to-db.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { hit } = JSON.parse(readFileSync(MATCH, "utf8"));

// 从库里拉全部 wuthering mods (id, title, character, drive_links, version)
const db = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("mods").select("id, title, character, drive_links, version").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  db.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`🗄  库内 mods: ${db.length}`);

// 归一化（只做 title 匹配所需的：去 .exe、去括号、去空白分隔、小写）
const norm = (s) => (s || "").toLowerCase()
  .replace(/\.exe$/i, "")
  .replace(/[（(【\[].*?[)）】\]]/g, "")
  .replace(/[\s\-—－:：,，.。·]+/g, "");
// 归一化的 title（去掉角色前缀后入库的 title）
const titleKey = (m) => norm(m.title);

const dbByTitleKey = new Map();
for (const m of db) {
  const k = titleKey(m);
  if (!k || k.length < 3) continue;
  if (!dbByTitleKey.has(k)) dbByTitleKey.set(k, []);
  dbByTitleKey.get(k).push(m);
}

const results = [];
let found = 0, already = 0, noMatch = 0;
for (const f of hit) {
  const tL = norm(f.name);
  // 找匹配的库 mod：title 归一后 == 文件名归一后 去角色前缀
  let cands = dbByTitleKey.get(tL) || [];
  if (cands.length === 0) {
    // 尝试去角色前缀：文件名的 title 部分（去前缀）
    // 简化：把候选放宽为 title 归一后是文件名归一的 子串(去掉角色前缀)
    for (const m of db) {
      const mk = titleKey(m);
      if (mk && mk.length >= 3 && (tL.includes(mk) || mk.includes(tL))) cands.push(m);
    }
  }
  // 去重
  const seen = new Set(); const uniq = [];
  for (const c of cands) { if (!seen.has(c.id)) { seen.add(c.id); uniq.push(c); } }

  let status = "NO_MATCH";
  let chosen = null;
  if (uniq.length === 1) {
    chosen = uniq[0];
    status = "MATCH";
  } else if (uniq.length > 1) {
    status = `AMBIG_${uniq.length}`;
  }
  if (chosen) {
    const hasXl = Array.isArray(chosen.drive_links) && chosen.drive_links.some((d) => String(d.platform).includes("迅雷"));
    if (hasXl) { status = "ALREADY"; already++; }
    else found++;
  } else if (uniq.length === 0) noMatch++;

  results.push({
    filename: f.name,
    dir: f.dir,
    xunlei: f.recs[0].xunlei,
    link: f.recs[0].link,
    pwd: f.recs[0].pwd,
    modId: chosen?.id || null,
    modTitle: chosen?.title || null,
    character: chosen?.character || null,
    candidates: uniq.map((u) => `${u.character}|${u.title}`),
    status,
  });
}

writeFileSync(REPORT, JSON.stringify(results, null, 2), "utf8");

console.log(`\n✅ 唯一匹配: ${results.filter((r) => r.status === "MATCH").length}`);
console.log(`⏭️  已有迅雷: ${already}`);
console.log(`⚠️ 歧义: ${results.filter((r) => r.status.startsWith("AMBIG")).length}`);
console.log(`❌ 无匹配: ${noMatch}\n`);

console.log("===== ✅ MATCH =====");
for (const r of results.filter((r) => r.status === "MATCH")) {
  console.log(`  ${r.filename}`);
  console.log(`     → ${r.modTitle} (${r.character}) | ${r.link}`);
}
console.log("\n===== ⚠️ 歧义 =====");
for (const r of results.filter((r) => r.status.startsWith("AMBIG"))) {
  console.log(`  ${r.filename} → ${r.candidates.join(" ; ")}`);
}
console.log("\n===== ❌ 无匹配 =====");
for (const r of results.filter((r) => r.status === "NO_MATCH")) {
  console.log(`  ${r.filename}`);
}
console.log("\n===== ⏭️ 已有迅雷 =====");
for (const r of results.filter((r) => r.status === "ALREADY")) {
  console.log(`  ${r.filename} → ${r.modTitle}`);
}
console.log(`\n📄 报告: ${REPORT}`);
