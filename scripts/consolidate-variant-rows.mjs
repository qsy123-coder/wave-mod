/**
 * 一次性修复：把某一天被错误拆开的同帖变体行合并回一张卡。
 *
 * 背景：每日上传脚本在某些运行路径下把同一 GameBanana 帖子的多个附件逐条插成了
 * 独立行（每个变体 2 条网盘链接、没有 variant 字段）。本脚本按日期目录里的
 * `.mod-groups.json` 把同一组的行找回来：
 *   - 保留组内「基变体」那一行，把其余行的链接按变体标签并进它的 drive_links；
 *   - 其余行只取消发布（is_published=false），不删除，方便回滚/人工核对；
 *   - 不碰更早日期、不属于该组的历史行。
 *
 * 用法：
 *   node scripts/consolidate-variant-rows.mjs --date=2026-11-11 --dry-run
 *   node scripts/consolidate-variant-rows.mjs --date=2026-11-11
 *
 * 跑完后需要重导快照并清香港缓存：
 *   node scripts/publish-mods-snapshot-to-cos.mjs --export
 *   node scripts/purge-hk-api-cache.mjs --all
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { config } from "dotenv";

import { dedupKey, resolveCharacterAndTitle } from "./daily-classify.mjs";
import { normalizeManifest } from "./mod-groups-pure.mjs";
import { dollarQuote, psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const BASE =
  process.env.WAVE_MOD_DAILY_BASE?.trim() ||
  String.raw`F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;

function arg(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((a) => a.startsWith(prefix))?.slice(prefix.length);
}
const isDryRun = process.argv.includes("--dry-run");
const date = arg("--date")?.trim();
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("❌ 需要 --date=YYYY-MM-DD");
  process.exit(1);
}
const [y, m, d] = date.split("-").map(Number);
const dateDir = join(BASE, `W-${y}.${m}.${d}`);
const manifest = normalizeManifest(JSON.parse(readFileSync(join(dateDir, ".mod-groups.json"), "utf8")));
if (!manifest) {
  console.error(`❌ ${dateDir}\\.mod-groups.json 不存在或格式不对`);
  process.exit(1);
}

const rows = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id,
  'character', character,
  'title', title,
  'drive_links', drive_links,
  'images', images,
  'is_published', is_published
)), '[]'::json)::text
from mods
where (created_at at time zone 'Asia/Shanghai')::date = ${dollarQuote(date)};
`);
const byKey = new Map(rows.map((row) => [dedupKey(row.character, row.title), row]));

let groupsMerged = 0;
let rowsUnpublished = 0;
for (const group of Object.values(manifest.groups)) {
  const matched = [];
  for (const variant of group.variants) {
    const parsed = resolveCharacterAndTitle(variant.name);
    const row = byKey.get(dedupKey(parsed.character, parsed.title));
    if (row && !matched.some((item) => item.row.id === row.id)) matched.push({ row, variant });
  }
  if (matched.length < 2) {
    console.log(`⏭️  跳过（只匹配到 ${matched.length} 行）: ${group.postUrl}`);
    continue;
  }

  const baseEntry =
    matched.find((item) => item.variant === group.variants[0]) ??
    matched.find((item) => dedupKey(item.row.character, item.row.title) === dedupKey(group.character, group.title)) ??
    matched[0];

  const links = [];
  const seen = new Set();
  for (const { row, variant } of matched) {
    for (const link of row.drive_links ?? []) {
      const slot = `${variant.label}|${link.platform}`;
      if (seen.has(slot)) continue;
      seen.add(slot);
      links.push({ ...link, variant: variant.label });
    }
  }

  const others = matched.filter((item) => item.row.id !== baseEntry.row.id);
  console.log(`\n🧩 ${group.character} | ${group.title}`);
  console.log(`   保留: ${baseEntry.row.id}  [${baseEntry.variant.label}] ${baseEntry.row.title}`);
  console.log(`   合并: ${matched.map((item) => item.variant.label).join(" / ")} → ${links.length} 条链接`);
  for (const item of others) console.log(`   下架: ${item.row.id}  [${item.variant.label}] ${item.row.title}`);

  if (isDryRun) {
    groupsMerged++;
    rowsUnpublished += others.length;
    continue;
  }

  await psqlJson(`
update mods
set drive_links = ${dollarQuote(JSON.stringify(links))}::jsonb,
    is_published = true,
    updated_at = now()
where id = ${dollarQuote(baseEntry.row.id)};
`);
  if (others.length > 0) {
    await psqlJson(`
update mods
set is_published = false,
    updated_at = now()
where id in (${others.map((item) => dollarQuote(item.row.id)).join(", ")});
`);
  }
  groupsMerged++;
  rowsUnpublished += others.length;
}

console.log(
  `\n${isDryRun ? "🔍 DRY-RUN" : "✅ 完成"}: 合并 ${groupsMerged} 组，下架 ${rowsUnpublished} 条重复行` +
    (isDryRun ? "（未写库）" : ""),
);
