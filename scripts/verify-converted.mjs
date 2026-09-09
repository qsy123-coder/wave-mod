/**
 * 抽查：已转换的爱弥斯 mod，确认 DB images[0] 已是 webp、图片可访问。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const titles = ["富兰克林-护士（【】；'。？切换）", "粉色长裙 by huanjue（alt+p切换）", "丰汝肥屯勒汝 by m.tsqn"];
for (const t of titles) {
  const { data } = await supabase.from("mods").select("id,title,images").eq("title", t);
  const m = data?.[0];
  if (!m) { console.log(`未找到: ${t}`); continue; }
  console.log(`\n${m.title}\n  ${m.images?.[0]}`);
  const r = await fetch(m.images?.[0], { method: "HEAD" });
  console.log(`  HEAD → ${r.status} ${r.headers.get("content-type")} len=${r.headers.get("content-length")}`);
}
