/**
 * 诊断：列出所有 featured 的爱弥斯 mod（真实 id + images），用于确定轮播回滚目标。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase
  .from("mods")
  .select("id,title,character,images,is_featured,featured_order,is_published,game_key")
  .eq("character", "爱弥斯")
  .eq("is_featured", true)
  .order("featured_order", { ascending: true, nullsFirst: false });
if (error) { console.error("查询失败:", error.message); process.exit(1); }
console.log(`featured 爱弥斯共 ${data.length} 条:`);
for (const m of data) {
  console.log(`\nid=${m.id}`);
  console.log(`featured_order=${m.featured_order} published=${m.is_published} game=${m.game_key}`);
  console.log(`title=${m.title}`);
  for (const img of m.images) console.log(`  img=${img}`);
}
