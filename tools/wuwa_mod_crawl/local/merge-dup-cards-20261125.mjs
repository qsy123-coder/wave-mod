/**
 * 一次性修复：把库里同一 mod 的多张卡合并成一张。
 *
 * 处理三组（2026-11-25 核对）：
 *  1. 女漂-星界调制器：基卡已有 6 个夸克变体，2~6 号卡早已下架，但它们的
 *     迅雷分享没并进来 → 按夸克 URL 相同补 5 条迅雷，其余行保持下架。
 *  2. 女漂-金色 x 5M：11-22 的卡已合并 4 个变体，11-23 还有一张单版本卡
 *     → 11-23 的链接并入基卡并标为 "5"，那张下架。
 *  3. 玛丽亚·玛丽亚：两张卡都是单版本、都没标签 → 基卡标 "1"，另一张标 "2"
 *     并进来，另一张下架。
 *
 * 只改 drive_links / description / is_published，不删行；跑之前的行状态会备份到
 * local/backups/merge-dup-cards-20261125-before.json。
 *
 * 用法：
 *   node tools/wuwa_mod_crawl/local/merge-dup-cards-20261125.mjs --dry-run
 *   node tools/wuwa_mod_crawl/local/merge-dup-cards-20261125.mjs --apply
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
config({ path: resolve(root, ".env"), override: true, quiet: true });
config({ path: resolve(root, ".env.local"), override: true, quiet: true });
const { psqlJson, dollarQuote } = await import(pathToFileURL(resolve(root, "scripts/psql-db.mjs")).href);

const apply = process.argv.includes("--apply");
const BACKUP = join(here, "backups/merge-dup-cards-20261125-before.json");

const XUNLEI = "迅雷网盘";
const QUARK = "夸克网盘";

/** 组 1：基卡补迅雷（按夸克 URL 找到对应变体） */
const STARGROUP_BASE = "210276b7-1173-4690-ba24-3eb98ac6c54f";
const STARGROUP_XUNLEI = [
  ["Base NSFW", "https://pan.xunlei.com/s/VP6DTSoLBVOu25iYwnRNIzcRA1?pwd=ttzh#"],
  ["Thicc SFW", "https://pan.xunlei.com/s/VP6DTSoKc3xC5ZrFyTMv1zF4A1?pwd=8242#"],
  ["Thicc NSFW", "https://pan.xunlei.com/s/VP6DTSoJm7h56vozPIYfTqkmA1?pwd=6kah#"],
  ["Thicc Heavy SFW", "https://pan.xunlei.com/s/VP6DTSoJlC5_oKwhlKUXBpBPA1?pwd=c7de#"],
  ["Thicc Heavy NSFW", "https://pan.xunlei.com/s/VP6DTSoIbyxls6Z8HLiDZ7iDA1?pwd=vxiu#"],
];

/** 组 2：11-23 的单版本卡并进 11-22 的基卡，标签 "5" */
const GOLD_BASE = "fcb71c23-3171-4116-a970-651b139f87d7";
const GOLD_MERGE = ["45687cbb-246b-48c2-aa9b-e69f9f839d90"];
const GOLD_LABEL = "5";

/** 组 3：两张单版本卡合并，基卡原链接标 "1"，另一张标 "2" */
const MARIA_BASE = "93df1fc8-d99d-4111-853f-b4da4c190dfb";
const MARIA_MERGE = ["da35fa1e-fcfc-4722-a2e8-23443264991b"];

const ALL_IDS = [
  STARGROUP_BASE,
  GOLD_BASE,
  ...GOLD_MERGE,
  MARIA_BASE,
  ...MARIA_MERGE,
];

const loadRows = async () => {
  const sql = `
select coalesce(json_agg(json_build_object(
  'id', id, 'title', title, 'description', description,
  'drive_links', drive_links, 'is_published', is_published
)), '[]'::json)::text
from mods where id in (${ALL_IDS.map((id) => dollarQuote(id)).join(", ")})
`;
  return await psqlJson(sql);
};

const keyOf = (link) => `${String(link?.platform ?? "")}|${String(link?.url ?? "")}`;

/** 追加链接，同一 (平台, 链接) 不重复加 */
const appendLinks = (list, additions) => {
  const seen = new Set(list.map(keyOf));
  const out = [...list];
  for (const item of additions) {
    if (seen.has(keyOf(item))) continue;
    seen.add(keyOf(item));
    out.push(item);
  }
  return out;
};

const labelPlatforms = (links) => [...new Set(links.map((l) => String(l?.platform ?? "").trim()).filter(Boolean))];

const rebuildDescription = (desc, links) => {
  const labels = [];
  for (const l of links) {
    const v = String(l?.variant ?? "").trim();
    if (v && !labels.includes(v)) labels.push(v);
  }
  if (labels.length < 2) return desc;
  const platforms = labelPlatforms(links);
  const tail = `共 ${labels.length} 个版本：${labels.join(" / ")}；${platforms.join(" / ")}下载。`;
  const text = String(desc ?? "");
  // 描述格式固定为「<角色> <标题> MOD，<说明>」，统一从「MOD，」之后重写，
  // 避免在已有「…下载。」后面再追加一段（2026-11-25 第一次跑就重复了）。
  if (/MOD，/.test(text)) return text.replace(/MOD，[\s\S]*$/, `MOD，${tail}`);
  return text ? `${text.replace(/[。；]?$/, "")}，${tail}` : tail;
};

const main = async () => {
  const rows = await loadRows();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = ALL_IDS.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`缺少行：${missing.join(", ")}`);
    process.exit(1);
  }

  mkdirSync(dirname(BACKUP), { recursive: true });
  writeFileSync(BACKUP, JSON.stringify(rows, null, 2), "utf8");
  console.log(`备份 ${rows.length} 行 → ${BACKUP}\n`);

  const updates = [];

  // ---- 组 1：补迅雷 ----
  {
    const base = byId.get(STARGROUP_BASE);
    const links = appendLinks(
      base.drive_links ?? [],
      STARGROUP_XUNLEI.map(([variant, url]) => ({ platform: XUNLEI, url, variant }))
    );
    updates.push({ id: base.id, title: base.title, links, unpublish: false, before: base.drive_links?.length ?? 0 });
  }

  // ---- 组 2：金色 x 5M ----
  {
    const base = byId.get(GOLD_BASE);
    const extra = (byId.get(GOLD_MERGE[0]).drive_links ?? []).map((l) => ({
      platform: l.platform,
      url: l.url,
      variant: GOLD_LABEL,
    }));
    const links = appendLinks(base.drive_links ?? [], extra);
    updates.push({ id: base.id, title: base.title, links, unpublish: false, before: base.drive_links?.length ?? 0 });
    for (const id of GOLD_MERGE) {
      const row = byId.get(id);
      updates.push({ id, title: row.title, links: row.drive_links ?? [], unpublish: true, before: row.drive_links?.length ?? 0 });
    }
  }

  // ---- 组 3：玛丽亚 ----
  {
    const base = byId.get(MARIA_BASE);
    const labeled = (base.drive_links ?? []).map((l) => ({ ...l, variant: l.variant ?? "1" }));
    const extra = (byId.get(MARIA_MERGE[0]).drive_links ?? []).map((l) => ({ platform: l.platform, url: l.url, variant: "2" }));
    const links = appendLinks(labeled, extra);
    updates.push({ id: base.id, title: base.title, links, unpublish: false, before: base.drive_links?.length ?? 0 });
    for (const id of MARIA_MERGE) {
      const row = byId.get(id);
      updates.push({ id, title: row.title, links: row.drive_links ?? [], unpublish: true, before: row.drive_links?.length ?? 0 });
    }
  }

  for (const u of updates) {
    const variants = [...new Set(u.links.map((l) => String(l?.variant ?? "").trim()).filter(Boolean))];
    console.log(
      `[${u.unpublish ? "下架" : "合并"}] ${u.title}  ${u.before} → ${u.links.length} 条` +
        (variants.length ? `  变体=[${variants.join(", ")}]` : "")
    );
  }

  if (!apply) {
    console.log("\nDRY-RUN（未写库）。加 --apply 执行。");
    return;
  }

  const statements = [];
  for (const u of updates) {
    const row = byId.get(u.id);
    if (u.unpublish) {
      statements.push(`update mods set is_published = false, updated_at = now() where id = ${dollarQuote(u.id)};`);
      continue;
    }
    const desc = rebuildDescription(row.description, u.links);
    statements.push(
      `update mods set drive_links = ${dollarQuote(JSON.stringify(u.links))}::jsonb, ` +
        `description = ${dollarQuote(desc)}, updated_at = now() where id = ${dollarQuote(u.id)};`
    );
  }

  const sql = `
begin;
${statements.join("\n")}
select json_build_object('updated', ${statements.length})::text;
commit;
`;
  const result = await psqlJson(sql);
  console.log(`\n✅ 已写库：${JSON.stringify(result)}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
