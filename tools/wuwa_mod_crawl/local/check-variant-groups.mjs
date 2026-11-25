/**
 * 预演命名工坊的分组：同一条 GameBanana 帖子的多个附件，改名时会被标成
 * `postUrl` + `variantLabel`，服务端据此写 `.mod-groups.json`，上传脚本据此合并成一张卡。
 *
 * 本脚本用空 suggestions 跑一遍 planAll（不影响分组，分组靠 scan 带出来的帖子 URL），
 * 只打印有 postUrl 的行，用来确认「这些附件会不会合成一个组」。
 *
 * 用法：
 *   node tools/wuwa_mod_crawl/local/check-variant-groups.mjs W-2026.11.25
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const load = (p) => import(pathToFileURL(resolve(root, p)).href);

const { scanDateDir } = await load("tools/mod-rename/lib/scan.mjs");
const { planAll } = await load("tools/mod-rename/lib/plan.mjs");

const BASE =
  process.env.WAVE_MOD_DAILY_BASE?.trim() ||
  String.raw`F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;
const CRAWL_DIR =
  process.env.WAVE_MOD_CRAWL_DIR?.trim() ||
  String.raw`F:\Projects\wave-mod\tools\wuwa_mod_crawl`;
const SUMMARY_DIR = join(BASE, "_Mod每日汇总");

const dateName = process.argv[2] || "W-2026.11.25";
const dateDir = join(BASE, dateName);

const scan = scanDateDir(dateDir, { crawlDir: CRAWL_DIR, summaryDir: SUMMARY_DIR });
for (const source of scan.sources) {
  const suggestions = Object.fromEntries(
    source.items.map((i) => [i.name, { characters: [], name: "", author: "", hotkeys: "" }])
  );
  const { rows } = planAll({
    items: source.items,
    suggestions,
    knownCharacters: new Set(),
    existingDedup: new Map(),
    glossary: [],
  });
  const grouped = rows.filter((r) => r.postUrl);
  console.log(`\n=== ${source.name}：${rows.length} 行，其中 ${grouped.length} 行有帖子分组`);
  if (!grouped.length) {
    for (const r of rows) console.log(`  - ${r.name}  (无 postUrl)`);
    continue;
  }
  const byPost = new Map();
  for (const r of grouped) {
    const list = byPost.get(r.postUrl) ?? [];
    list.push(r);
    byPost.set(r.postUrl, list);
  }
  for (const [url, list] of byPost) {
    const flag = list.length >= 2 ? "GROUP" : "single";
    console.log(`  [${flag}] ${url}  title=${list[0].groupTitle ?? ""}`);
    for (const r of list) {
      console.log(
        `      ${r.isBaseVariant ? "*" : " "} ${r.name}  -> label="${r.variantLabel ?? ""}"  src="${r.src ?? ""}"`
      );
    }
  }
}
