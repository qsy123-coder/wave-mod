/**
 * 为库内 12 个缺迅雷 mod 补上确认可行的迅雷链接（追加 drive_links，保留原有夸克）。
 * 键：title + character 唯一确定记录。幂等：已含迅雷则跳过。
 * 用法：node scripts/apply-12-xunlei.mjs            --dry-run
 *       node scripts/apply-12-xunlei.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const isApply = process.argv.includes("--apply");
const GAME_KEY = "wuthering-waves";

// 12 条确认：title|character → {link, pwd}
const CONFIRMED = [
  { title: "Starlight Fox Aemeath [Multitoggle]", character: "爱弥斯", link: "https://pan.xunlei.com/s/VP14haQ89sTsER9hA0fI8DGSA1?pwd=wtan#", pwd: "wtan", src: "StarlightFoxAemeath_Master" },
  { title: "Thicc Aemeath", character: "爱弥斯", link: "https://pan.xunlei.com/s/VP14h_t0xApPzUOYO6eUr0UMA1?pwd=3962#", pwd: "3962", src: "AemeathThiccMod" },
  { title: "重奏（ctrl+890上下左右切换）", character: "渊武", link: "https://pan.xunlei.com/s/VP14krpdW9BDTCQ8M25IOYLnA1?pwd=ex8c#", pwd: "ex8c", src: "渊舞-重奏" },
  { title: "编队图片-动画", character: "露西", link: "https://pan.xunlei.com/s/VP14iczpYtNqtP9_Is5m5TDaA1?pwd=yt7c#", pwd: "yt7c", src: "露西编队图片-动画" },
  { title: "(含皮肤）-渡鸦礼服(num1~9)", character: "女漂", link: "https://pan.xunlei.com/s/VP14k3RPqRHvEfFS5EmHOAgrA1?pwd=7uif#", pwd: "7uif", src: "女漂(含皮肤)-渡鸦礼服" },
  { title: "常驻五星枪-HK416武器  by _eldarC", character: "武器", link: "https://pan.xunlei.com/s/VP14kUSmKaJpZVL2wu0RSLmXA1?pwd=cmyr#", pwd: "cmyr", src: "琳奈专武 常驻五星枪-HK416武器" },
  { title: "曲线优美", character: "清宵", link: "https://pan.xunlei.com/s/VP14kA9W9sTsER9hA0fIA7-mA1?pwd=ysku#", pwd: "ysku", src: "清霄-曲线优美" },
  { title: "极霸剑", character: "清宵", link: "https://pan.xunlei.com/s/VP14kA7QVGY3nGGklpY7sM4OA1?pwd=fy3n#", pwd: "fy3n", src: "清宵背后的剑-极霸剑" },
  { title: "极霸剑", character: "武器", link: "https://pan.xunlei.com/s/VP14kACIRIkENyTqdDbXbEjhA1?pwd=34zx#", pwd: "34zx", src: "清宵专武-极霸剑" },
  { title: "坎特蕾拉全ui-动态nsfw-v2.0.6", character: "UI", link: "https://pan.xunlei.com/s/VP14icwlqRHvEfFS5EmHN4JTA1?pwd=nijb#", pwd: "nijb", src: "坎特蕾拉全ui-动态nsfw-v2.0.6" },
  { title: "卡提希娅全ui-动态nsfw-v1.7.5", character: "UI", link: "https://pan.xunlei.com/s/VP14icwjl7y8JwxooxqSnscCA1?pwd=v8bf#", pwd: "v8bf", src: "卡提希娅全ui-动态nsfw-v1.7.5" },
  { title: "菲比全ui-动态nsfw-v2.0.6", character: "UI", link: "https://pan.xunlei.com/s/VP14ictzgiQDx3IyEK069-PVA1?pwd=vk66#", pwd: "vk66", src: "菲比全ui-动态nsfw-v2.0.6" },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

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

const toWrite = [];
const notFound = [];
const already = [];
for (const c of CONFIRMED) {
  const rows = db.filter((m) => (m.title||"").trim() === c.title && (m.character||"").trim() === c.character);
  if (!rows.length) { notFound.push(`${c.character}|${c.title}`); continue; }
  for (const row of rows) {
    if (hasXl(row.drive_links)) { already.push(c.src); continue; }
    toWrite.push({ ...c, id: row.id });
  }
}

console.log("===== 待执行 =====");
for (const t of toWrite) console.log(`  ${t.character} | ${t.title}  ← ${t.src}`);
console.log(`\n✅ 待写: ${toWrite.length}`);
console.log(`⏭️  已含迅雷: ${already.length}`);
if (notFound.length) { console.log(`\n⚠️ 未查到记录:`); notFound.forEach((x)=>console.log(`  ${x}`)); }

if (!isApply) { console.log("\n🔍 DRY-RUN：未写库。确认后用 --apply 执行。"); process.exit(0); }

console.log("\n💾 写入中...");
let ok=0, fail=0;
for (const t of toWrite) {
  const { data: row } = await supabase.from("mods").select("drive_links").eq("id", t.id).single();
  const cur = Array.isArray(row?.drive_links) ? row.drive_links : [];
  const next = [...cur, { platform: "迅雷网盘", url: t.link }];
  const { error } = await supabase.from("mods").update({ drive_links: next }).eq("id", t.id);
  if (error) { fail++; console.log(`  ❌ ${t.title}: ${error.message}`); }
  else { ok++; console.log(`  ✅ ${t.character}|${t.title}`); }
}
console.log(`\n📊 成功 ${ok} / 失败 ${fail}`);
