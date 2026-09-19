/**
 * 一次性排查脚本：对比教程各版本 published / draft 的章节图片，定位「后台改了图前台没变」。
 * 用法: node scripts/check-tutorial-images.mjs [章节关键字，默认 03]
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const keyword = process.argv[2] ?? "03";

const { data: versions, error: vErr } = await supabase
  .from("tutorial_versions")
  .select("id, name, sort_order, is_visible, is_default")
  .order("sort_order", { ascending: true });

if (vErr) {
  console.error("❌ 读取版本失败:", vErr.message);
  process.exit(1);
}

console.log("版本列表:");
for (const v of versions ?? []) {
  console.log(`  - ${v.id}  name=${v.name}  visible=${v.is_visible}  default=${v.is_default}`);
}

const { data: configs, error: cErr } = await supabase
  .from("tutorial_configs")
  .select("id, version_id, status, title, image_base_path")
  .order("id", { ascending: true });

if (cErr) {
  console.error("❌ 读取配置失败:", cErr.message);
  process.exit(1);
}

console.log("\n配置:");
for (const c of configs ?? []) {
  console.log(`  - ${c.id}  (version=${c.version_id}, status=${c.status}, base=${c.image_base_path})`);
}

for (const cfg of configs ?? []) {
  const { data: chapters, error: chErr } = await supabase
    .from("tutorial_chapters")
    .select("id, chapter_key, sort_order, title, images:tutorial_images(url, filename, sort_order)")
    .eq("config_id", cfg.id)
    .ilike("chapter_key", `%${keyword}%`)
    .order("sort_order", { ascending: true });

  if (chErr) {
    console.error(`❌ 读取章节失败 (${cfg.id}):`, chErr.message);
    continue;
  }
  if (!chapters || chapters.length === 0) continue;

  console.log(`\n=== ${cfg.id} ===`);
  for (const ch of chapters) {
    const imgs = [...(ch.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    console.log(`  章节 ${ch.chapter_key} — ${ch.title}  (${imgs.length} 张图)`);
    imgs.forEach((img, i) => {
      const url = img.url?.startsWith("http") ? img.url : `(本地) ${img.url}`;
      console.log(`    [${i}] ${url}`);
    });
  }
}
