/**
 * 合规下线：把 mods 表中所有 nsfw=true 的记录置为 false。
 * 背景：NSFW 内容已在前端下线（隐藏筛选入口与徽标），数据层同步清零，
 *      避免任何 nsfw 标记残留造成公开风险。
 *
 * 用法: node scripts/offline-nsfw.mjs
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

// 更新前统计
const { count: beforeCount, error: beforeErr } = await supabase
  .from("mods")
  .select("id", { count: "exact", head: true })
  .eq("nsfw", true);
if (beforeErr) { console.error("查询失败:", beforeErr.message); process.exit(1); }
console.log(`更新前 nsfw=true 记录数: ${beforeCount}`);

if (beforeCount === 0) {
  console.log("无需更新。");
  process.exit(0);
}

// 执行 UPDATE（全部置 false）
const { error } = await supabase
  .from("mods")
  .update({ nsfw: false })
  .eq("nsfw", true);

if (error) {
  console.error("更新失败:", error.message);
  process.exit(1);
}
console.log(`已更新 ${beforeCount} 条记录 nsfw → false`);

// 更新后验证
const { count: afterCount, error: afterErr } = await supabase
  .from("mods")
  .select("id", { count: "exact", head: true })
  .eq("nsfw", true);
if (afterErr) { console.error("验证失败:", afterErr.message); process.exit(1); }
console.log(`更新后 nsfw=true 记录数: ${afterCount}`);

if (afterCount !== 0) {
  console.error("警告：仍有 nsfw=true 记录残留！");
  process.exit(1);
}
console.log("合规下线完成。");
