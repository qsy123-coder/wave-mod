/** 检查所有标题含 loli 的 MOD 及其发布状态 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await supabase
  .from("mods")
  .select("id, title, character, is_published, images")
  .ilike("title", "%loli%");
console.log(`标题含 loli 的 MOD: ${data?.length ?? 0}${error ? ` ERR ${error.message}` : ""}`);
for (const m of data ?? []) {
  console.log(`\n${m.title}`);
  console.log(`  id: ${m.id}`);
  console.log(`  character: ${m.character}  is_published: ${m.is_published}`);
  console.log(`  images[0]: ${m.images?.[0] ?? "无"}`);
}
