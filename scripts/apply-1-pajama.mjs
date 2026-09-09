// 为 爱弥斯-小爱居家服 by midandan_21afa 补上迅雷链接。
// 分享名在导出里被截断为「by_midandan_21afa.exe」，按「标题+角色」精确命中库内记录。
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const isApply = process.argv.includes("--apply");
const GAME_KEY = "wuthering-waves";

const TARGET = {
  title: "小爱居家服 Aemeath pajamas NSFW",
  character: "爱弥斯",
  link: "https://pan.xunlei.com/s/VP14haQ3RIkENyTqdDbX_E1_A1?pwd=4a3h#",
  pwd: "4a3h",
  src: "by_midandan_21afa",
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: rows, error } = await supabase.from("mods")
  .select("id,title,character,drive_links")
  .eq("game_key", GAME_KEY)
  .eq("title", TARGET.title).eq("character", TARGET.character);
if (error) { console.error("❌", error.message); process.exit(1); }
if (!rows || !rows.length) { console.log("⚠️ 未查到记录"); process.exit(1); }

const hasXl = (l) => Array.isArray(l) && l.some((d) => String(d.platform || "").includes("迅雷"));
let pending = 0;
for (const row of rows) {
  if (hasXl(row.drive_links)) { console.log(`⏭️ 已含迅雷 (${row.id})`); continue; }
  pending++;
  if (!isApply) { console.log(`🔍 DRY-RUN 待写: ${row.character}|${row.title} ← ${TARGET.src}`); continue; }
  const cur = Array.isArray(row.drive_links) ? row.drive_links : [];
  const next = [...cur, { platform: "迅雷网盘", url: TARGET.link }];
  const { error: e2 } = await supabase.from("mods").update({ drive_links: next }).eq("id", row.id);
  console.log(e2 ? `  ❌ ${e2.message}` : `  ✅ ${row.character}|${row.title}`);
}
console.log(`\n📊 待写 ${pending} / 总命中 ${rows.length}`);
if (!isApply) process.exit(0);
