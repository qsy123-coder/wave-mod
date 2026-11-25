/**
 * 打印待合并组的完整行数据（含 drive_links），用于合并前核对。
 *
 * 用法：node tools/wuwa_mod_crawl/local/query-group-details.mjs
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
config({ path: resolve(root, ".env"), override: true, quiet: true });
config({ path: resolve(root, ".env.local"), override: true, quiet: true });
const { psqlJson } = await import(pathToFileURL(resolve(root, "scripts/psql-db.mjs")).href);

const LIKE = [
  "女漂-星界调制器%",
  "女漂-金色 x 5M%",
  "玛丽亚·玛丽亚%",
];

const sql = `
select coalesce(json_agg(json_build_object(
  'id', id, 'title', title, 'character', character,
  'created_at', created_at, 'published', is_published,
  'links', drive_links, 'desc', description
) order by title), '[]'::json)::text
from mods
where ${LIKE.map((p) => `title like '${p}'`).join(" or ")}
`;
const rows = await psqlJson(sql);
const list = Array.isArray(rows) ? rows : [];
console.log(`共 ${list.length} 行\n`);
for (const r of list) {
  console.log(`--- ${r.id}`);
  console.log(`    ${r.character} | ${r.title} | ${String(r.created_at).slice(0, 10)} | published=${r.published}`);
  console.log(`    desc=${JSON.stringify(r.desc ?? "").slice(0, 120)}`);
  const links = Array.isArray(r.links) ? r.links : [];
  for (const l of links) {
    console.log(`    link: ${l?.platform ?? "?"} | variant=${JSON.stringify(l?.variant ?? null)} | ${String(l?.url ?? "").slice(0, 80)}`);
  }
}
