/**
 * 查最近的 mods 行，看同帖多附件是否被拆成了多张卡。
 *
 * 用法（在项目根或任意目录）：
 *   node tools/wuwa_mod_crawl/local/query-recent-mods.mjs
 *   node tools/wuwa_mod_crawl/local/query-recent-mods.mjs 2026-11-20
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
config({ path: resolve(root, ".env"), override: true, quiet: true });
config({ path: resolve(root, ".env.local"), override: true, quiet: true });

const { psqlJson } = await import(pathToFileURL(resolve(root, "scripts/psql-db.mjs")).href);

const since = process.argv[2] || "2026-11-20";
const sql = `
select coalesce(json_agg(json_build_object(
  'id', id, 'character', character, 'title', title,
  'created_at', created_at, 'published', is_published,
  'links', drive_links
) order by title), '[]'::json)::text
from mods
where created_at >= '${since}'
`;
const rows = await psqlJson(sql);
const list = Array.isArray(rows) ? rows : [];
console.log(`共 ${list.length} 行（created_at >= ${since}）\n`);
for (const r of list) {
  const links = Array.isArray(r.links) ? r.links : [];
  const variants = [...new Set(links.map((l) => l?.variant).filter(Boolean))];
  console.log(
    `${String(r.created_at).slice(0, 16)} | ${r.character} | ${r.title} | links=${links.length} | variants=[${variants.join(", ")}]`
  );
}
