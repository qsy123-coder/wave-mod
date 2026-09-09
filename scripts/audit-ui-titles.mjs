/**
 * 审计库内 character=UI(含别名「反虚化，ui界面，场景，葫芦，特效等」→UI) 的 mod：
 * 列出全部 title,判断标题里是否已带角色前缀。只读,不写。
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const ALIAS_UI = ["UI", "反虚化，ui界面，场景，葫芦，特效等"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const db = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data, error } = await supabase.from("mods")
    .select("id, title, character, drive_links").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (error) { console.error("❌", error.message); process.exit(1); }
  if (!data || !data.length) break;
  db.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}

const ui = db.filter((m) => ALIAS_UI.includes((m.character || "").trim()));
const sorted = [...ui].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

console.log(`库内 character=UI 的 mod: ${ui.length}\n`);
console.log("===== 全部标题 =====");
for (const m of sorted) {
  // 是否已带角色前缀:取标题第一个「-」前的片段,判断是否命中常见角色名或含角色特征
  const head = (m.title || "").split(/[-－]/)[0].trim();
  const flag = head && head.length <= 6 && !/^(全|动态|nsfw|v\d|ui)/i.test(head) ? "✅带前缀" : "⚠️可能笼统";
  console.log(`  [${flag}] ${m.title}  (character=${m.character})`);
}
