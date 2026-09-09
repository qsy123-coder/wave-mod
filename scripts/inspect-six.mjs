import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const keys = ["小爱居家", "早乙", "蓝色蝴蝶", "堕天使", "脱衣舞娘", "绛雨", "雨洗双锋", "尤诺", "吟霖", "嘉贝莉娜", "滑翔翼"];
const all = [];
for (let from = 0; ; from += 1000) {
  const { data } = await supabase.from("mods")
    .select("id,title,character,drive_links,created_at")
    .eq("game_key", "wuthering-waves").range(from, from + 999);
  if (!data || !data.length) break;
  all.push(...data);
  if (data.length < 1000) break;
}
const hit = all.filter((m) => keys.some((k) => (m.title || "").includes(k)));
console.log("matched rows:", hit.length);
for (const m of hit) {
  console.log(`ID=${m.id} | char=${m.character} | title=${m.title} | created=${m.created_at}`);
  const links = Array.isArray(m.drive_links) ? m.drive_links : [];
  if (!links.length) console.log("   (no drive_links)");
  for (const d of links) console.log(`   - ${String(d.platform || "?")} : ${String(d.url || "")}`);
  console.log("");
}
