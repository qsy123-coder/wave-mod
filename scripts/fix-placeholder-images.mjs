/**
 * 修正两条占位图：把「同款不同名」mod 的 images[0] 复用已存在 mod 的 preview.webp。
 * 只读定位 + 定向更新 images[0]。幂等：已是真图则跳过。
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 目标: { 需要改的 title 精确匹配, 复用来源 title 精确匹配 }
const MAP = [
  { target: "女漂-调皮猫 by levi", reuse: "女漂-调皮猫futa by levi" },
  { target: "玄翎-花后v1.0full（alt+k）by levi", reuse: "花后 by levi" },
];

async function getMod(title) {
  const { data, error } = await supabase.from("mods").select("id, title, character, images").eq("game_key", GAME_KEY).eq("title", title).limit(10);
  if (error) { console.error(`查询失败 ${title}: ${error.message}`); return []; }
  return data || [];
}

for (const { target, reuse } of MAP) {
  const targets = await getMod(target);
  const reuses = await getMod(reuse);
  if (targets.length === 0) { console.log(`⚠️ 目标不存在: ${target}`); continue; }
  if (reuses.length === 0) { console.log(`⚠️ 复用来源不存在: ${reuse}`); continue; }
  const reuseImg = reuses[0].images?.[0] || null;
  if (!reuseImg) { console.log(`⚠️ 复用源无图: ${reuse}`); continue; }
  for (const t of targets) {
    const cur = t.images?.[0] || "";
    if (cur === reuseImg) { console.log(`⏭️  已复用，跳过: ${target}`); continue; }
    const next = [reuseImg, ...(t.images || []).filter((i) => i !== reuseImg)];
    const { error } = await supabase.from("mods").update({ images: next }).eq("id", t.id);
    if (error) console.error(`  ❌ ${target} [id=${t.id}]: ${error.message}`);
    else console.log(`  ✅ ${target} (id=${t.id}) ${reuse}`.trim());
  }
}
console.log("\n完成。");
