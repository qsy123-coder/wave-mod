/**
 * 找出「男漂」里用了占位图（无预览图）的 mod，并把对应 .exe 从男漂文件夹移出。
 *
 * 用法:
 *   node scripts/move-missing-image-exe.mjs --dry-run   # 只报告匹配，不移动
 *   node scripts/move-missing-image-exe.mjs              # 执行移动
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const EXE_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\男漂`;
const TARGET_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\男漂_缺图`;
const PLACEHOLDER =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const isDryRun = process.argv.includes("--dry-run");

/** 递归列出目录下所有 .exe 文件 */
function listExeFiles(dir) {
  const result = [];
  function walk(d) {
    if (!existsSync(d)) return;
    const entries = readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".exe")) result.push(full);
    }
  }
  walk(dir);
  return result;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 1. 查询所有 男漂 mod
const { data: mods, error } = await supabase
  .from("mods")
  .select("id, title, images")
  .eq("game_key", "wuthering-waves")
  .eq("character", "男漂");
if (error) { console.error("查询失败:", error.message); process.exit(1); }

const placeholderMods = mods.filter(
  (m) => !m.images?.[0] || m.images[0] === PLACEHOLDER
);
console.log(`男漂 mod 总数: ${mods.length}，占位图(无预览图): ${placeholderMods.length}\n`);

// 2. 列出 .exe 文件
const exeFiles = listExeFiles(EXE_DIR);
const exeKeyMap = new Map(); // basename(去.exe) -> fullpath
for (const f of exeFiles) exeKeyMap.set(basename(f).replace(/\.exe$/i, ""), f);
console.log(`男漂 文件夹 .exe 文件数: ${exeFiles.length}\n`);

// 3. 反向匹配：DB title → 候选 .exe 文件名（男漂/男主 前缀 + 各种分隔符）
function candidateKeys(title) {
  const keys = [];
  for (const prefix of ["男漂", "男主"]) {
    for (const sep of ["-", "－", " ", ""]) keys.push(prefix + sep + title);
  }
  return keys;
}

const matched = [];
const unmatched = [];
for (const m of placeholderMods) {
  const title = (m.title ?? "").trim();
  let found = null;
  for (const k of candidateKeys(title)) {
    if (exeKeyMap.has(k)) { found = exeKeyMap.get(k); break; }
  }
  if (found) matched.push({ title, exe: found });
  else unmatched.push(title);
}

console.log(`=== 匹配结果 ===`);
console.log(`占位图 mod: ${placeholderMods.length}，匹配到 .exe: ${matched.length}，未匹配: ${unmatched.length}\n`);

console.log("--- 已匹配（将移动） ---");
matched.forEach((x) => console.log(`  [${x.title}]  →  ${basename(x.exe)}`));

if (unmatched.length) {
  console.log("\n--- 未匹配到 .exe ---");
  unmatched.forEach((t) => console.log(`  ${t}`));
}

// 4. 移动（非 dry-run）
if (isDryRun) {
  console.log(`\n🔍 DRY-RUN: 未执行移动。将移动 ${matched.length} 个文件到 ${TARGET_DIR}`);
  process.exit(0);
}

if (matched.length === 0) {
  console.log("\n无需移动。");
  process.exit(0);
}

if (!existsSync(TARGET_DIR)) mkdirSync(TARGET_DIR, { recursive: true });
let moved = 0;
for (const { exe } of matched) {
  const dest = join(TARGET_DIR, basename(exe));
  if (existsSync(dest)) {
    console.warn(`   ⚠ 目标已存在，跳过: ${basename(exe)}`);
    continue;
  }
  renameSync(exe, dest);
  moved++;
}
console.log(`\n✅ 已移动 ${moved} 个 .exe 到 ${TARGET_DIR}`);
