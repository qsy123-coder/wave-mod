/**
 * 分析「男漂」占位图 mod 是否有可用源图。
 * 交叉比对 DB 记录 vs 整理文件夹\男漂 里的图片（含全局索引兜底）。
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const IMG_ROOT = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\整理文件夹`;
const NANPIAO_IMG_DIR = join(IMG_ROOT, "男漂");
const PLACEHOLDER =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** 递归收集图片 basename(去扩展名) -> fullpath */
function buildImageIndex(rootDir) {
  const map = new Map();
  function walk(dir) {
    if (!existsSync(dir)) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const ext = extname(e.name).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) continue;
        const base = basename(e.name, ext);
        if (!map.has(base)) map.set(base, full);
      }
    }
  }
  walk(rootDir);
  return map;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: mods, error } = await supabase
  .from("mods")
  .select("id, title, images")
  .eq("game_key", "wuthering-waves")
  .eq("character", "男漂");
if (error) { console.error("查询失败:", error.message); process.exit(1); }

const placeholderMods = mods.filter((m) => !m.images?.[0] || m.images[0] === PLACEHOLDER);
const withImageMods = mods.filter((m) => m.images?.[0] && m.images[0] !== PLACEHOLDER);
console.log(`男漂 mod 总数 ${mods.length}：有图 ${withImageMods.length}，占位图 ${placeholderMods.length}\n`);

// 全局图片索引 + 男漂子目录图片
const globalIdx = buildImageIndex(IMG_ROOT);
const nanpiaoIdx = buildImageIndex(NANPIAO_IMG_DIR);
console.log(`全局图片索引: ${globalIdx.size} 张；整理文件夹\男漂: ${nanpiaoIdx.size} 张\n`);

/** 归一化：去前缀(男漂/男主)、去版本、去括号切换标注、去空格，用于模糊匹配 */
function normalizeForMatch(s) {
  return s
    .replace(/^(男漂|男主)[-－]?/, "")
    .replace(/\.exe$/i, "")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/v?\d+(\.\d+)*(fix)?/gi, "")
    .replace(/[-－\s·・]/g, "")
    .toLowerCase();
}

// 为每个占位图 mod 尝试匹配源图
const matchedGlobal = [];
const matchedNanpiao = [];
const noMatch = [];

for (const m of placeholderMods) {
  const title = (m.title ?? "").trim();
  // 候选：男漂-title / 男主-title / title
  const candidates = [`男漂-${title}`, `男主-${title}`, `男漂${title}`, `男主${title}`, title];

  // 1) 精确匹配
  let hit = null;
  for (const c of candidates) {
    if (nanpiaoIdx.has(c)) { hit = nanpiaoIdx.get(c); break; }
    if (globalIdx.has(c)) { hit = globalIdx.get(c); break; }
  }

  if (hit) {
    matchedNanpiao.push({ title, img: hit });
    continue;
  }

  // 2) 模糊匹配（归一化后相等）
  const normTitle = normalizeForMatch(title);
  let fuzzyHit = null;
  for (const [imgBase, imgPath] of globalIdx) {
    if (normalizeForMatch(imgBase) === normTitle) { fuzzyHit = imgPath; break; }
  }
  if (fuzzyHit) {
    matchedGlobal.push({ title, img: fuzzyHit });
    continue;
  }

  noMatch.push(title);
}

console.log(`=== 占位图 mod 源图匹配结果 (共 ${placeholderMods.length}) ===`);
console.log(`精确匹配到源图: ${matchedNanpiao.length}`);
console.log(`模糊匹配到源图: ${matchedGlobal.length}`);
console.log(`完全无源图: ${noMatch.length}\n`);

if (matchedNanpiao.length) {
  console.log("--- 精确匹配 ---");
  matchedNanpiao.forEach((x) => console.log(`  [${x.title}] -> ${basename(x.img)}`));
}
if (matchedGlobal.length) {
  console.log("\n--- 模糊匹配 ---");
  matchedGlobal.forEach((x) => console.log(`  [${x.title}] -> ${basename(x.img)}`));
}
if (noMatch.length) {
  console.log("\n--- 无源图 ---");
  noMatch.forEach((t) => console.log(`  ${t}`));
}
