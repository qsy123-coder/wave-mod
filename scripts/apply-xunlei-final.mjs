/**
 * 最终落库：把 17 条缺迅雷链接的 mod 补上 {platform:'迅雷网盘', url}。
 * 唯一命中 12 条直接用；多链接 5 条按用户确认的推荐各取一条。
 * 幂等：已含迅雷则跳过。--apply 才写库；默认 dry-run 打印。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/strict-match-report.json";
const isApply = process.argv.includes("--apply");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const rep = JSON.parse(readFileSync(REPORT_PATH, "utf8"));

// 多链接 → 用户选定的目标 link（key 用 title, 匹配 report multi）
// 「选无 (1) 后缀规范名」→ norm 去掉 (1) 后优先；这里直接硬编码用户确认结果（从 report 里取对应 link）
const MULTI_CHOICE = {}; // title -> chosenLink (运行时空转，我们从 report cands 里按规则挑)

// 规则: 给定 cands 数组 [{xunleiName, link}]，返回推荐 link
function pick(cands, title) {
  // 用户规则：优先「无 (N) 后缀」；弗洛洛那条取带角色前缀的；清宵-简单切换取清霄变体
  if (title.includes("今汐-桃夭灼灼")) return cands.find((c) => /^弗洛洛-/.test(c.xunleiName));
  if (title.includes("简单切换")) return cands.find((c) => /^清霄-/.test(c.xunleiName)) || cands[0];
  // 其它: 取「名字不以数字 ( 结尾」的（即无重复后缀），否则第一
  const noDup = cands.find((c) => !/\(\d+\)\s*$/.test(c.xunleiName));
  return noDup || cands[0];
}

const decisions = [];
for (const it of rep.single) decisions.push({ character: it.character, title: it.title, link: it.link, kind: "unique" });
for (const it of rep.multi) {
  const chosen = pick(it.cands, it.title);
  decisions.push({ character: it.character, title: it.title, link: chosen.link, kind: "multi", chosenXunlei: chosen.xunleiName, options: it.cands.map((c) => c.xunleiName) });
}

console.log(`📋 待补 ${decisions.length} 条\n`);
for (const d of decisions) {
  console.log(`[${d.character}] ${d.title}`);
  if (d.kind === "multi") console.log(`  选: ${d.chosenXunlei}\n  → ${d.link}`);
  else console.log(`  → ${d.link}`);
}

if (!isApply) { console.log("\n🔍 DRY-RUN: 未写库。确认后用 --apply。"); process.exit(0); }

async function apply() {
  console.log("\n💾 写库...");
  let ok = 0, fail = 0;
  for (const d of decisions) {
    const { data } = await supabase.from("mods").select("id, title, drive_links").eq("game_key", GAME_KEY).eq("title", d.title);
    let target = (data || []).find((m) => String(m.character) === d.character) || (data || [])[0];
    if (!target) { fail++; console.error(`  ❌ 未找到 mod: [${d.character}] ${d.title}`); continue; }
    const cur = target.drive_links || [];
    if (cur.some((x) => String(x.platform).includes("迅雷"))) { console.log(`  ⏭️  已含迅雷，跳过: [${d.character}] ${d.title}`); continue; }
    const next = [...cur, { platform: "迅雷网盘", url: d.link }];
    const { error } = await supabase.from("mods").update({ drive_links: next }).eq("id", target.id);
    if (error) { fail++; console.error(`  ❌ ${d.title}: ${error.message}`); }
    else { ok++; console.log(`  ✅ [${d.character}] ${d.title}`); }
  }
  console.log(`\n📊 成功 ${ok}，失败 ${fail}`);
}
apply();
