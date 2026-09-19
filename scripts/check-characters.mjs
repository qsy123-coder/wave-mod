/**
 * 一次性排查脚本：列出库内全部 distinct character 及其条数。
 * 用途：上传新批次前核对分类，避免脚本切出站内不存在的假分类
 *      （前台角色分类页由 distinct character 动态生成）。
 *
 * 用法: node scripts/check-characters.mjs [关键字...]
 *       带关键字时只打印命中项，便于核对候选写法是否正确。
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

const keywords = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const rows = [];
const PAGE_SIZE = 1000;
for (let from = 0; ; from += PAGE_SIZE) {
  const { data, error } = await supabase
    .from("mods")
    .select("character")
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

const counts = new Map();
for (const r of rows) {
  const c = String(r.character ?? "").trim();
  counts.set(c, (counts.get(c) ?? 0) + 1);
}

const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`库里共 ${entries.length} 个 distinct character，${rows.length} 条记录\n`);

for (const [c, n] of entries) {
  const hit = keywords.length === 0 || keywords.some((k) => c.includes(k));
  if (hit) console.log(`${String(n).padStart(6)}  ${c}`);
}
