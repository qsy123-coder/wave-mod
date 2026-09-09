/**
 * 把每日 mod 的迅雷链接写库：对每个 文件名→modId→xunlei link 追加 drive_links 中的迅雷网盘。
 * 数据源：daily-final.json 的 44 条 + 手动补 暮星（清宵, id=ca242430-...）。
 * 幂等：已含「迅雷网盘」则跳过；否则追加 { platform:'迅雷网盘', url } 到现有 drive_links 末尾。
 * 用法：node scripts/apply-daily-xunlei.mjs            --dry-run
 *       node scripts/apply-daily-xunlei.mjs --apply   --实际写库
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const REPORT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-apply.json";
const isApply = process.argv.includes("--apply");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const final = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-final.json", "utf8"));
// 手动补 暮星（matched 被 min-length 规则漏掉，已人工确认 db 存在：清宵 / 暮星 / quark-only）
const manual = {
  filename: "清宵-暮星",
  dir: "W-2026.9.5",
  modId: "ca242430-ed21-4493-82bf-63bb810cd6eb",
  modTitle: "暮星",
  character: "清宵",
  link: "https://pan.xunlei.com/s/VP153HpD3iBIkungQ2l1B2-BA1?pwd=ygcn#",
  pwd: "ygcn",
  status: "MANUAL",
};

// 收集待写目标
const targets = [];
const seen = new Set();
for (const r of final) {
  if (!r.modId || !r.link) continue;
  if (!(r.status === "UNIQUE" || r.status === "CHAR_MATCH" || r.status === "TITLE_MATCH")) continue;
  const key = r.modId;
  if (seen.has(key)) continue;
  seen.add(key);
  targets.push({ modId: r.modId, modTitle: r.modTitle, character: r.character, link: r.link, filename: r.filename });
}
const mk = manual.modId;
if (!seen.has(mk)) { seen.add(mk); targets.push({ modId: mk, modTitle: manual.modTitle, character: manual.character, link: manual.link, filename: manual.filename }); }

console.log(`🎯 待写 ${targets.length} 条（含手动 暮星）\n`);

// 拉取这些 mod 的当前 drive_links 以检查是否已有迅雷
const ids = targets.map((t) => t.modId);
const { data: rows, error } = await supabase.from("mods").select("id, title, character, drive_links").in("id", ids);
if (error) { console.error("❌ 查询失败:", error.message); process.exit(1); }
const byId = new Map(rows.map((x) => [x.id, x]));

const toWrite = [];
const already = [];
for (const t of targets) {
  const row = byId.get(t.modId);
  if (!row) { console.log(`  ⚠️ 库中不存在 ${t.modId} (${t.filename})`); continue; }
  const cur = Array.isArray(row.drive_links) ? row.drive_links : [];
  if (cur.some((d) => String(d.platform).includes("迅雷"))) { already.push(t); continue; }
  toWrite.push({ ...t, row });
}

console.log(`✅ 待追加迅雷: ${toWrite.length} | ⏭️ 已含迅雷: ${already.length}\n`);

console.log("===== 待执行清单 =====");
for (const t of toWrite) {
  console.log(`  ${t.filename}`);
  console.log(`     ${t.modTitle} (${t.character})`);
  console.log(`     → ${t.link}`);
}
if (already.length) {
  console.log("\n===== 已含迅雷（跳过） =====");
  for (const t of already) console.log(`  ${t.filename} → ${t.modTitle}`);
}

writeFileSync(REPORT, JSON.stringify({ toWrite: toWrite.map((t) => ({ modId: t.modId, filename: t.filename, title: t.modTitle, character: t.character, link: t.link })), already: already.map((t) => t.filename) }, null, 2));

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未写库。确认后用 --apply 执行。");
  process.exit(0);
}

// ---------- 写库 ----------
console.log(`\n💾 开始写入 ${toWrite.length} 条...`);
let applied = 0, failed = 0;
for (const t of toWrite) {
  const cur = Array.isArray(t.row.drive_links) ? t.row.drive_links : [];
  const next = [...cur, { platform: "迅雷网盘", url: t.link }];
  const { error } = await supabase.from("mods").update({ drive_links: next }).eq("id", t.modId);
  if (error) { failed++; console.log(`  ❌ ${t.modTitle}: ${error.message}`); }
  else { applied++; console.log(`  ✅ ${t.modTitle}`); }
}
console.log(`\n📊 完成：成功 ${applied}，失败 ${failed}`);
