/**
 * 定位库内 5 条「丢失角色前缀」的 全ui-动态nsfw-v* 记录，拉出完整 drive_links，
 * 用 URL/filesha 里的文件名反推真实角色。只读。
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const TARGETS = ["全ui-动态nsfw-v1.6.5","全ui-动态nsfw-v1.7.5","全ui-动态nsfw-v2.0.6","全ui-动态nsfw-v2.1.7"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const db = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data, error } = await supabase.from("mods")
    .select("id, title, character, drive_links, description").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (error) { console.error("❌", error.message); process.exit(1); }
  if (!data || !data.length) break;
  db.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}

for (const t of TARGETS) {
  const hits = db.filter((m) => (m.title || "").trim() === t);
  console.log(`\n===== ${t} —— 命中 ${hits.length} 条 =====`);
  for (const m of hits) {
    console.log(`  id: ${m.id}`);
    console.log(`  character: ${m.character}`);
    console.log(`  title: ${m.title}`);
    if (m.description) console.log(`  desc: ${String(m.description).slice(0, 120)}`);
    for (const d of (Array.isArray(m.drive_links) ? m.drive_links : [])) {
      console.log(`  drive[${d.platform}]: ${d.url || ""}`.slice(0, 200));
    }
  }
}
console.log("\n===== 同一版本的各候选角色在库里是否已有前缀版 =====");
const series = {
  "v1.6.5": ["露帕","今汐","卡提希娅","菲比"],
  "v1.7.5": ["今汐","卡提希娅"],
  "v2.0.6": ["菲比","坎特蕾拉"],
  "v2.1.7": ["男女漂","守岸人"],
};
for (const [ver, chars] of Object.entries(series)) {
  const list = db.filter((m) => (m.title||"").includes(ver)).map((m) => m.title);
  console.log(`\n[${ver}] 库内含该版本号的标题:`);
  for (const t of [...new Set(list)]) console.log(`    - ${t}`);
}
