/**
 * 给丢失角色前缀的全ui-动态nsfw-v* 补充角色前缀（只改 title，character 保持 UI）。
 * 本次仅处理「可确定角色」的条目：
 *   - 全ui-动态nsfw-v1.6.5  → 露帕全ui-动态nsfw-v1.6.5   （每日导出露帕全ui-动态nsfw-v1.6.5.exe）
 *   - 全ui-动态nsfw-v2.1.7  → 男女漂全ui-动态nsfw-v2.1.7  （每日导出男女漂全ui-动态nsfw-v2.1.7.exe）
 * 用法：node scripts/fix-ui-prefix.mjs            --dry-run
 *       node scripts/fix-ui-prefix.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const isApply = process.argv.includes("--apply");
const ENTRIES = [
  { id: "b3843dd1-8b09-4016-98c3-7836ba868494", oldTitle: "全ui-动态nsfw-v1.6.5", newTitle: "露帕全ui-动态nsfw-v1.6.5" },
  { id: "9733895d-e44a-407a-b0ad-25969d4ce5bc", oldTitle: "全ui-动态nsfw-v2.1.7", newTitle: "男女漂全ui-动态nsfw-v2.1.7" },
  { id: "5b56c256-12b4-4327-abb3-db04bc5abe3a", oldTitle: "全ui-动态nsfw-v1.7.5", newTitle: "卡提希娅全ui-动态nsfw-v1.7.5" },
  { id: "eb2d728e-2062-4a03-be09-7a22925cbdb1", oldTitle: "全ui-动态nsfw-v2.0.6", newTitle: "菲比全ui-动态nsfw-v2.0.6" },
  { id: "1864153a-af63-4377-995c-c43e458b8352", oldTitle: "全ui-动态nsfw-v2.0.6", newTitle: "坎特蕾拉全ui-动态nsfw-v2.0.6" },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 校验：改名后库内不得已存在同 title
const { data: existing } = await supabase.from("mods").select("id, title").in("title", ENTRIES.map((e) => e.newTitle));
const existingTitles = new Set((existing || []).map((e) => e.title));
for (const e of ENTRIES) {
  if (existingTitles.has(e.newTitle)) { console.log(`  ❌ 冲突：${e.newTitle} 已存在，跳过`); e.skip = true; }
}

console.log("===== 待执行 =====");
for (const e of ENTRIES) {
  console.log(`  [${e.skip ? "SKIP" : "OK"}] ${e.newTitle}`);
}

if (!isApply) { console.log("\n🔍 DRY-RUN：未写库。确认后用 --apply 执行。"); process.exit(0); }

console.log("\n💾 开始写入...");
for (const e of ENTRIES) {
  if (e.skip) continue;
  const { error } = await supabase.from("mods").update({ title: e.newTitle }).eq("id", e.id);
  console.log(error ? `  ❌ ${e.newTitle}: ${error.message}` : `  ✅ ${e.newTitle}`);
}
