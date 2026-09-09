/**
 * 为库里 5 个「违规改名后重传」的 mod 补上新的迅雷链接。
 * 键：title + character 精确命中（DB 里保留的是正常标题，重传后的分享名已映射过来）。
 * 幂等：已含迅雷则跳过。保留原有夸克/百度，仅追加迅雷。
 * 用法：node scripts/apply-5-reshares.mjs            --dry-run
 *       node scripts/apply-5-reshares.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const isApply = process.argv.includes("--apply");
const GAME_KEY = "wuthering-waves";

// 5 条确认：title|character → 新的迅雷链接
const CONFIRMED = [
  { title: "绛雨-雨洗双锋", character: "尤诺", link: "https://pan.xunlei.com/s/VP15MsKNFC6XBaNh7Mo31N1yA1?pwd=df97#", pwd: "df97", src: "尤诺-降雨-雨溪双风" },
  { title: "脱衣舞娘2.0（567切换）", character: "吟霖", link: "https://pan.xunlei.com/s/VP15MsKJMwnNkG2wKln0jJ5wA1?pwd=7396#", pwd: "7396", src: "吟霖-托伊舞娘2.0" },
  { title: "堕天使 by Caverabbit（456切换）", character: "嘉贝莉娜", link: "https://pan.xunlei.com/s/VP15MsKL4MZ1m9k0P719A1bPA1?pwd=vn5x#", pwd: "vn5x", src: "嘉贝莉娜-惰天师" },
  { title: "早乙女优华v1.4（按p切换）", character: "丹瑾", link: "https://pan.xunlei.com/s/VP15MsKJ6BTtO5LukL7rJdbQA1?pwd=wy36#", pwd: "wy36", src: "丹瑾-早已楠优化v1.4" },
  { title: "滑翔翼-蓝色蝴蝶（内置去葫芦）", character: "滑翔翼,翱翔翼,科考摩托", link: "https://pan.xunlei.com/s/VP15MsKKhY9X36H6r_BUAgthA1?pwd=e9nq#", pwd: "e9nq", src: "滑翔翼-兰瑟胡蝶" },
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
const hasXl = (l) => Array.isArray(l) && l.some((d) => String(d.platform || "").includes("迅雷"));

const toWrite = [];
const notFound = [];
const already = [];
for (const c of CONFIRMED) {
  const rows = db.filter((m) => (m.title || "").trim() === c.title && (m.character || "").trim() === c.character);
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
if (notFound.length) { console.log(`\n⚠️ 未查到记录:`); notFound.forEach((x) => console.log(`  ${x}`)); }

if (!isApply) { console.log("\n🔍 DRY-RUN：未写库。确认后用 --apply 执行。"); process.exit(0); }

console.log("\n💾 写入中...");
let ok = 0, fail = 0;
for (const t of toWrite) {
  const { data: row } = await supabase.from("mods").select("drive_links").eq("id", t.id).single();
  const cur = Array.isArray(row?.drive_links) ? row.drive_links : [];
  const next = [...cur, { platform: "迅雷网盘", url: t.link }];
  const { error } = await supabase.from("mods").update({ drive_links: next }).eq("id", t.id);
  if (error) { fail++; console.log(`  ❌ ${t.title}: ${error.message}`); }
  else { ok++; console.log(`  ✅ ${t.character}|${t.title}`); }
}
console.log(`\n📊 成功 ${ok} / 失败 ${fail}`);
