/**
 * 查库里「同一个帖子被拆成多张卡」的痕迹：
 *  - 标题去掉结尾编号/版本片段后相同的多行
 *  - drive_links 指向同一个 gamebanana 帖子 id 的多行
 *
 * 用法：node tools/wuwa_mod_crawl/local/query-title-dupes.mjs [since=2026-11-15]
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
config({ path: resolve(root, ".env"), override: true, quiet: true });
config({ path: resolve(root, ".env.local"), override: true, quiet: true });
const { psqlJson } = await import(pathToFileURL(resolve(root, "scripts/psql-db.mjs")).href);

const since = process.argv[2] || "2026-11-15";
const sql = `
select coalesce(json_agg(json_build_object(
  'id', id, 'title', title, 'character', character,
  'created_at', created_at, 'links', drive_links
) order by title), '[]'::json)::text
from mods
where created_at >= '${since}'
`;
const rows = await psqlJson(sql);
const list = Array.isArray(rows) ? rows : [];

const norm = (t) =>
  String(t ?? "")
    .replace(/\s+by\s+.*$/i, "")
    .replace(/[-_ ]?\d+(\.\d+)?\s*$/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const byTitle = new Map();
const byPost = new Map();
for (const r of rows) {
  const k = norm(r.title);
  if (k) byTitle.set(k, [...(byTitle.get(k) ?? []), r]);
  for (const l of r.links ?? []) {
    const m = /gamebanana\.com\/mods\/(\d+)/i.exec(String(l?.url ?? ""));
    if (!m) continue;
    byPost.set(m[1], [...(byPost.get(m[1]) ?? []), r]);
  }
}

console.log(`扫描 ${list.length} 行（created_at >= ${since}）\n`);
let found = 0;
console.log("== 同名多卡（去掉编号/版本后标题相同）==");
for (const [k, group] of byTitle) {
  if (group.length < 2) continue;
  found += 1;
  console.log(`\n[${group.length} 张] ${k}`);
  for (const r of group) console.log(`   ${r.id} | ${r.character} | ${r.title} | ${String(r.created_at).slice(0, 10)}`);
}
console.log("\n== 同一 GameBanana 帖子多卡 ==");
for (const [mid, group] of byPost) {
  const uniq = [...new Map(group.map((r) => [r.id, r])).values()];
  if (uniq.length < 2) continue;
  found += 1;
  console.log(`\n[post ${mid}] ${uniq.length} 张`);
  for (const r of uniq) console.log(`   ${r.id} | ${r.character} | ${r.title}`);
}
console.log(`\n合计 ${found} 处可疑`);
