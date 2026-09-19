/**
 * 一次性排查脚本：按 character / title 关键字列出库内记录（character | title）。
 * 用途：上传前核对某分类的既有写法，避免造出重复或假分类。
 *
 * 用法: node scripts/check-titles.mjs <关键字...>
 *       任一关键字命中 character 或 title 即打印。
 *       node scripts/check-titles.mjs --char=守岸人    # 只看该分类的全部 title 写法
 *       node scripts/check-titles.mjs --after=2026-09-13   # 只看该日期及之后入库的记录
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const charArg = process.argv.find((a) => a.startsWith("--char="));
const charFilter = charArg ? charArg.slice("--char=".length).trim() : null;
const afterArg = process.argv.find((a) => a.startsWith("--after="));
const afterFilter = afterArg ? afterArg.slice("--after=".length).trim() : null;
const keywords = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (keywords.length === 0 && !charFilter && !afterFilter) {
  console.error("用法: node scripts/check-titles.mjs <关键字...> | --char=<分类名>");
  process.exit(1);
}

const rows = [];
const PAGE_SIZE = 1000;
for (let from = 0; ; from += PAGE_SIZE) {
  const { data, error } = await supabase
    .from("mods")
    .select("character, title, created_at")
    .eq("game_key", "wuthering-waves")
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) {
    console.error("❌ 查询失败:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < PAGE_SIZE) break;
}

const hits = rows.filter((r) => {
  if (afterFilter) return String(r.created_at ?? "").slice(0, 10) >= afterFilter;
  if (charFilter) return String(r.character ?? "").includes(charFilter);
  return keywords.some((k) => String(r.character ?? "").includes(k) || String(r.title ?? "").includes(k));
});

console.log(`命中 ${hits.length} 条（共 ${rows.length} 条）\n`);
for (const r of hits.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
  console.log(`${String(r.created_at).slice(0, 10)}  ${r.character} | ${r.title}`);
}
