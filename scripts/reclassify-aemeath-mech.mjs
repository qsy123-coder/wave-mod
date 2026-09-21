/**
 * 把库里「其实属于爱弥斯的机甲、但被归到 爱弥斯」的记录，改到新分类「爱弥斯的机甲」。
 *
 * 背景：
 *   `爱弥斯的机甲-*` 批次最早由 scripts/upload-fifth.mjs 以 keepFull 方式入库，
 *   当时 character 被映射成了 爱弥斯（见该脚本 CHARACTER_PREFIX_MAP）。
 *   2026-09-20 用户要求新建独立分类「爱弥斯的机甲」，这 4 条需一并迁过去。
 *
 * 为什么用**精确 title 白名单**而不是前缀/关键词匹配：
 *   库里另有「灵魂 光 焰(含机甲武器等)」「鸣式利维亚坦（含机甲）」「守岸人（含机甲武器等)」
 *   等 5 条 title 含「机甲」的记录，但它们本质是爱弥斯换装 mod（只是附带了机甲武器），
 *   用户已明确**不**迁。用白名单可避免规则变化时误伤它们。
 *
 * 只改 character，不动 title / created_at / 图片 / 链接 —— 3 条带前缀的 title 与
 * 分类名同名，改后 dedupKey 会把前缀归一化掉，不会与既有记录冲突。
 *
 * 用法：
 *   node scripts/reclassify-aemeath-mech.mjs            # dry-run，只报告
 *   node scripts/reclassify-aemeath-mech.mjs --apply    # 实际写库
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const FROM_CHARACTER = "爱弥斯";
const TO_CHARACTER = "爱弥斯的机甲";
const isApply = process.argv.includes("--apply");

/** 待迁移记录的精确 title（来源：全量 2026-09-20 库扫描，共 4 条） */
const TARGET_TITLES = [
  "爱弥斯的机甲-丰汝肥屯 by slap",
  "爱弥斯的机甲-赦罪者大卡v2（；）",
  "爱弥斯的机甲-时韵大卡-守岸人光辉头v4（；）",
  "维度机甲（上下左切换）",
];

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ 缺少 Supabase 环境变量");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ==================== 查库 ====================

const { data, error } = await supabase
  .from("mods")
  .select("id, title, character")
  .eq("game_key", GAME_KEY)
  .eq("character", FROM_CHARACTER)
  .in("title", TARGET_TITLES);

if (error) {
  console.error("❌ 查询失败:", error.message);
  process.exit(1);
}
const rows = data ?? [];

// ==================== 校验：每条白名单 title 必须且只能命中 1 行 ====================

const byTitle = new Map();
for (const r of rows) {
  if (!byTitle.has(r.title)) byTitle.set(r.title, []);
  byTitle.get(r.title).push(r);
}

const problems = [];
for (const t of TARGET_TITLES) {
  const hits = byTitle.get(t) ?? [];
  if (hits.length !== 1) problems.push({ title: t, hits: hits.length });
}

console.log(`🔍 目标分类: ${FROM_CHARACTER} → ${TO_CHARACTER}`);
console.log(`📋 白名单 ${TARGET_TITLES.length} 条，命中 ${rows.length} 条\n`);

if (problems.length) {
  console.error("❌ 以下 title 未唯一命中，未写库：");
  for (const p of problems) console.error(`   - ${p.title}  →  命中 ${p.hits} 行`);
  process.exit(1);
}

// 顺带确认目标分类当前是否已有记录（只做提示，不阻断）
const { count: targetCount } = await supabase
  .from("mods")
  .select("id", { count: "exact", head: true })
  .eq("game_key", GAME_KEY)
  .eq("character", TO_CHARACTER);
console.log(`ℹ️  库内 ${TO_CHARACTER} 现有 ${targetCount ?? 0} 条\n`);

console.log("===== 待迁移 =====");
for (const r of rows) {
  console.log(`  ${r.character} → ${TO_CHARACTER}\n      ${r.title}\n      id=${r.id}`);
}

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未写库。确认无误后加 --apply 执行。");
  process.exit(0);
}

// ==================== 写库（按 id 逐条，失败单独报） ====================

console.log(`\n💾 开始更新 ${rows.length} 条...`);
let ok = 0;
let failed = 0;
for (const r of rows) {
  const { error: updErr } = await supabase
    .from("mods")
    .update({ character: TO_CHARACTER })
    .eq("id", r.id);
  if (updErr) {
    failed++;
    console.error(`  ❌ ${r.title}: ${updErr.message}`);
  } else {
    ok++;
    console.log(`  ✅ ${r.title}`);
  }
}
console.log(`\n📊 完成：成功 ${ok}，失败 ${failed}`);
