/**
 * 迁移角色分类：把 character='漂泊者' 的记录改为 '男漂'。
 * 背景：侧栏拆分「漂泊者」为「男漂」和「女漂」，此前男漂系上传时用了「漂泊者」。
 *
 * 用法: node scripts/migrate-rover-character.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 迁移前统计
const { data: before, count: beforeCount, error: beforeErr } = await supabase
  .from("mods")
  .select("character", { count: "exact", head: true })
  .eq("game_key", "wuthering-waves")
  .eq("character", "漂泊者");
if (beforeErr) { console.error("查询失败:", beforeErr.message); process.exit(1); }
console.log(`迁移前 character='漂泊者' 记录数: ${beforeCount}`);

if (beforeCount === 0) {
  console.log("无需迁移。");
  process.exit(0);
}

// 执行 UPDATE
const { error } = await supabase
  .from("mods")
  .update({ character: "男漂" })
  .eq("game_key", "wuthering-waves")
  .eq("character", "漂泊者");

if (error) {
  console.error("迁移失败:", error.message);
  process.exit(1);
}

// 迁移后验证
const { data: after, error: afterErr } = await supabase
  .from("mods")
  .select("character")
  .eq("game_key", "wuthering-waves")
  .in("character", ["男漂", "女漂", "漂泊者"]);

if (afterErr) { console.error("验证失败:", afterErr.message); process.exit(1); }

const counts = {};
for (const m of after) counts[m.character] = (counts[m.character] || 0) + 1;
console.log("迁移后角色分布:");
for (const [c, n] of Object.entries(counts).sort()) console.log(`   ${c}: ${n}`);
