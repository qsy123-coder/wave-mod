/**
 * 一次性初始化下载量：downloads_count = max(现有下载量, round(浏览量 * 0.65))。
 *
 * 浏览量取自**线上 API 展示值**（`/api/mods` 已经把实时互动计数叠加到 views 上），
 * 不是 Supabase 里那列已经停止写入的旧 views。
 *
 * 默认 dry-run，只打印统计与样例；加 --apply 才会写库。
 * 用 GREATEST 保证**永远不会把已有真实下载量改小** —— 这个脚本可以安全重跑。
 *
 * 用法（在项目根目录）：
 *   node --env-file=.env.local scripts/seed-downloads-from-views.mjs
 *   node --env-file=.env.local scripts/seed-downloads-from-views.mjs --apply
 *
 * 可选环境变量：
 *   WM_BASE   数据源（默认 https://go.sunnyrose.xyz）
 */
import { psqlJson } from "./psql-db.mjs";

const BASE = (process.env.WM_BASE || "https://go.sunnyrose.xyz").replace(/\/+$/, "");
const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 48;
const DOWNLOAD_RATIO = 0.65;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  throw new Error(`请求失败：${url}（${lastError instanceof Error ? lastError.message : String(lastError)}）`);
}

async function fetchAllMods() {
  const mods = [];
  for (let page = 1; ; page++) {
    const data = await fetchJson(`${BASE}/api/mods?page=${page}&pageSize=${PAGE_SIZE}&sort=latest`);
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      if (!item?.id) continue;
      mods.push({ id: item.id, views: Number(item.views) || 0, downloads: Number(item.downloads) || 0 });
    }
    if (!data.hasMore) break;
    if (page % 10 === 0) console.log(`  已读取 ${mods.length} 条…`);
  }
  return mods;
}

const mods = await fetchAllMods();
if (mods.length === 0) {
  console.error("❌ 没有读到任何 mod，终止。");
  process.exit(1);
}

const targets = mods.map((mod) => ({
  ...mod,
  next: Math.max(mod.downloads, Math.round(mod.views * DOWNLOAD_RATIO)),
}));

const totalViews = mods.reduce((sum, mod) => sum + mod.views, 0);
const totalDownloadsBefore = mods.reduce((sum, mod) => sum + mod.downloads, 0);
const totalDownloadsAfter = targets.reduce((sum, mod) => sum + mod.next, 0);
const changed = targets.filter((mod) => mod.next !== mod.downloads);
const zeroViews = targets.filter((mod) => mod.views === 0).length;
const zeroTargets = targets.filter((mod) => mod.next === 0).length;

console.log(`\n数据源：${BASE}`);
console.log(`mod 总数：${mods.length}`);
console.log(`浏览量合计：${totalViews}`);
console.log(`下载量合计：${totalDownloadsBefore} -> ${totalDownloadsAfter}`);
console.log(`会发生变化：${changed.length} 条；浏览量为 0 的：${zeroViews} 条；目标仍为 0 的：${zeroTargets} 条`);

const sample = targets
  .slice()
  .sort((a, b) => b.views - a.views)
  .slice(0, 8);
console.log("\n浏览量最高的 8 条：");
for (const mod of sample) {
  console.log(`  ${mod.id}  views=${mod.views}  downloads=${mod.downloads} -> ${mod.next}`);
}

if (!APPLY) {
  console.log("\nDRY RUN：未写库。确认无误后加 --apply 执行。");
  process.exit(0);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("❌ 缺少 DATABASE_URL（请用 --env-file=.env.local 运行）");
  process.exit(1);
}

// 5300 条左右的 VALUES 列表；id 是 UUID，数值是整数，不需要额外转义。
const values = targets.map((mod) => `('${mod.id}', ${mod.next})`).join(",\n");
const sql = `WITH seed(id, downloads) AS (VALUES
${values}
),
updated AS (
  UPDATE mods m
  SET downloads_count = GREATEST(COALESCE(m.downloads_count, 0), s.downloads)
  FROM seed s
  WHERE m.id = s.id::uuid
  RETURNING m.id
)
SELECT json_build_object('updated', (SELECT count(*) FROM updated))::text;
`;

console.log("\n写库中…");
const result = await psqlJson(sql);
console.log(`✅ 完成：${result?.updated ?? 0} 条记录已按 max(现有, 浏览量×0.65) 更新。`);
console.log("提示：详情页读的是实时详情接口，刷新即可看到新的下载量；列表缓存不影响该字段展示。");
