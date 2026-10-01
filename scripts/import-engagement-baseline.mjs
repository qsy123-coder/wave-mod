/**
 * 把 Supabase 里现存的互动计数导成「基线」，给游客计数器当起点。
 *
 * 为什么需要：互动链路已改成「基线 + 增量」两层。上线前库里已有的
 * likes_count / favorites_count / views 是历史热度，不能在切换的那一刻被清零。
 * 本脚本把它们原样抄成一份种子文件，之后所有新互动都累加在它之上。
 *
 * 三条硬约束：
 *   1. **只读**：只 select，绝不 update —— Supabase 里的数据一个字都不改。
 *   2. **幂等**：输出是整份覆盖写。重跑多少次结果都一样，不会叠加。
 *   3. **走直连 5432**：Supabase 出口配额超限时 REST 网关一律回 402，
 *      而直连 psql 不受影响（与 backup-to-github.mjs 同源，见 scripts/psql-db.mjs）。
 *
 * 产物 `data/engagement-baseline.json` 是**故意提交进 git** 的部署种子：
 * 这样换机器部署时开箱即用，不需要上线后再连一次数据库。
 * 运行时增量另有其文件（data/runtime/engagement.json，不进 git，但要备份）。
 *
 * 用法:
 *   node scripts/import-engagement-baseline.mjs            # 只看统计，不写文件
 *   node scripts/import-engagement-baseline.mjs --apply    # 写入基线文件
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { config } from "dotenv";

import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const GAME_KEY = "wuthering-waves";

// ⚠️ 与 src/lib/engagement/store.ts 的 BASELINE_PATH 保持一致（那份是 TS，跨不过来）
const BASELINE_PATH =
  process.env.ENGAGEMENT_BASELINE_PATH?.trim() || join(process.cwd(), "data", "engagement-baseline.json");

requireDatabaseUrl();

console.log(APPLY ? "✍️  APPLY 模式：将覆盖写入基线文件。" : "🔍 DRY-RUN 模式：只统计，不写文件。");
console.log(`   产物路径: ${BASELINE_PATH}\n`);

// 只读：把三个计数列原样取出来。coalesce 是为了把 NULL 变成 0，
// 而不是让它以 null 混进 JSON（下游 parseBaseline 虽然也容错，但没必要留隐患）。
const rows = await psqlJson(`
select coalesce(
  json_agg(json_build_object(
    'id', id,
    'likes', coalesce(likes_count, 0),
    'favorites', coalesce(favorites_count, 0),
    'views', coalesce(views, 0)
  )),
  '[]'::json
)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)};
`);

if (!Array.isArray(rows)) {
  console.error("❌ 查询失败：psql 未返回数组。");
  process.exit(1);
}

const baseline = {};
let tracked = 0;
let sumLikes = 0;
let sumFavorites = 0;
let sumViews = 0;

for (const row of rows) {
  const likes = Math.max(0, Math.floor(Number(row.likes) || 0));
  const favorites = Math.max(0, Math.floor(Number(row.favorites) || 0));
  const views = Math.max(0, Math.floor(Number(row.views) || 0));

  // 全 0 的条目不入库：绝大多数 mod 三个数都是 0，写进去只会把文件撑大
  if (likes === 0 && favorites === 0 && views === 0) continue;

  baseline[row.id] = { likes, favorites, views };
  tracked += 1;
  sumLikes += likes;
  sumFavorites += favorites;
  sumViews += views;
}

console.log("=== 基线统计 ===");
console.log(`   库内 mod 总数      : ${rows.length}`);
console.log(`   计入基线的 mod     : ${tracked}（三个数全为 0 的不写）`);
console.log(`   点赞合计           : ${sumLikes}`);
console.log(`   收藏合计           : ${sumFavorites}`);
console.log(`   浏览合计           : ${sumViews}`);

if (!APPLY) {
  console.log("\n🔍 DRY-RUN：未写文件。确认无误后加 --apply 落盘。");
  process.exit(0);
}

mkdirSync(dirname(BASELINE_PATH), { recursive: true });
// 紧凑写：这份文件是机器读的，缩进会把 350KB 撑成毫无意义的体积
writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline)}\n`, "utf8");

console.log(`\n✅ 基线已写入: ${BASELINE_PATH}`);
console.log("   这份文件是部署种子，请把它提交进 git。");
