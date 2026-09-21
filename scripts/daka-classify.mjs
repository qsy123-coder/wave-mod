/**
 * 「大卡」批次的分类规则 + 3 条旧行的迁移规则。
 *
 * 为什么单独一个文件：这几条规则决定 78 条 mod 落在哪个分类下，写错的表现是**静默**的
 * ——前台凭空多一个分类页、或某条 mod 挂到错的角色下，都不会有报错。所以抽成无副作用
 * 的纯模块，交给 scripts/daka-classify.test.mjs 逐条锁住（同 mods-snapshot-export.mjs 的形状：
 * 不读 argv、不读 env、import 时无副作用，可被 vitest 直接 import）。
 *
 * 口径来自用户 2026-09-21 的原话：「除了卡提西亚的草、手偶和玩偶归类为卡提希娅外，
 * 其它的新建一个分类『芙露德莉斯』」。`芙露德莉斯`（Fleurdelys）即卡提希娅的大卡形态，
 * 故「大卡-*」与「大卡提希娅的剑/武器-*」全部归它，title 去掉「卡提希娅-」前缀。
 *
 * 这是**用户明确允许**的新角色分类（CLAUDE.md 默认禁止凭空新建 character 值）；
 * 头像暂与卡提希娅共用，见 src/lib/constants/character-images.ts。
 */

import { dollarQuote } from "./psql-db.mjs";

export const FLEURDELYS = "芙露德莉斯";
export const CARTETHYIA = "卡提希娅";

/** 「卡提希娅-大卡-XXX」→ 芙露德莉斯，title 只剥掉角色名这一层，保留「大卡-XXX」 */
const DAKA_LEADER = "卡提希娅-";
const DAKA_MARK = "卡提希娅-大卡";

/** 大卡的武器：整包归芙露德莉斯，title 保留完整 key（库内 `武器 | 千古-赛琳娜武器` 是同一写法） */
const DAKA_WEAPON_PREFIXES = ["大卡提希娅的剑", "大卡提希娅的武器"];

/**
 * 用户点名留在卡提希娅的 3 件小物（玩偶 / 手偶 / 草）。
 * 这三件在库里都没有预览图（源目录里也只有 exe），入库时走占位图。
 */
const CARTETHYIA_ITEM_PREFIXES = ["卡提希娅玩偶", "卡提希娅的手偶", "卡提希娅的草"];

/**
 * 「卡提希娅-<非大卡>-…」（典型是小卡）与本次口径直接冲突：小卡属于卡提希娅本体，
 * 归到芙露德莉斯是错的。这种情况宁可报错停，也不要猜。
 */
const CARTETHYIA_NOT_DAKA_RE = /^卡提希娅[-－](?!大卡)/;

/**
 * 把一个分享 key 解析成 `{ character, title, fallback }`。
 *
 * `fallback: true` 表示走了「其它都归芙露德莉斯」的兜底分支（title 保留完整 key）——
 * 本批 78 条里预计一条都没有，所以 dry-run 会把它单独打出来告警。
 */
export function resolveDakaTarget(key) {
  const raw = String(key ?? "").trim();
  if (!raw) throw new Error("空的分享名，无法分类");

  for (const prefix of DAKA_WEAPON_PREFIXES) {
    if (raw.startsWith(prefix)) return { character: FLEURDELYS, title: raw, fallback: false };
  }

  if (raw.startsWith(DAKA_MARK)) {
    return { character: FLEURDELYS, title: raw.slice(DAKA_LEADER.length), fallback: false };
  }

  for (const prefix of CARTETHYIA_ITEM_PREFIXES) {
    if (raw.startsWith(prefix)) {
      // 「卡提希娅的手偶-…」→「手偶-…」：连「的」一起去掉
      const title = raw.slice(CARTETHYIA.length).replace(/^的/, "");
      return { character: CARTETHYIA, title, fallback: false };
    }
  }

  if (CARTETHYIA_NOT_DAKA_RE.test(raw)) {
    throw new Error(
      `「${raw}」是「卡提希娅-非大卡-…」形态（如小卡），与「大卡归芙露德莉斯」的口径冲突，需人工确认后再入库`
    );
  }

  return { character: FLEURDELYS, title: raw, fallback: true };
}

/**
 * 迁移一条库内旧行：`character` 改到芙露德莉斯，`description` 同步改写。
 *
 * title 只在带「卡提希娅-」全前缀时才剥（库内 3 条里只有「神之御装」是那种写法），
 * description 用与入库同一条模板，避免同一分类下两种文案。
 *
 * `quarkUrl` 传本批 CSV 里的新夸克链接时，顺手刷新 `drive_links` 里平台为「夸克网盘」
 * 的那条（用户 2026-09-21 确认：这 3 条都是重分享过的新链接）。不传则**原样保留**
 * —— 注意不能让它变成 undefined，`jsonb_populate_recordset` 里缺键的列是 NULL，
 * 而迁移语句会整列覆盖，那会把库内的迅雷链接抹掉。
 */
export function migrateLegacyRow(row, { quarkUrl } = {}) {
  const title = String(row.title).startsWith(DAKA_LEADER)
    ? String(row.title).slice(DAKA_LEADER.length)
    : String(row.title);
  return {
    id: row.id,
    character: FLEURDELYS,
    title,
    description: `${FLEURDELYS} ${title} MOD，夸克网盘下载。`,
    drive_links: quarkUrl ? refreshQuarkLink(row.drive_links, quarkUrl) : row.drive_links,
  };
}

const QUARK_PLATFORM = "夸克网盘";

/**
 * 刷新夸克链接：同平台的那条换 URL，其它平台（迅雷等）原样保留且顺序不变；
 * 库里原本没有夸克条目时追加一条。
 */
export function refreshQuarkLink(driveLinks, url) {
  const links = Array.isArray(driveLinks) ? driveLinks : [];
  let replaced = false;
  const next = links.map((link) => {
    if (link?.platform !== QUARK_PLATFORM || replaced) return link;
    replaced = true;
    return { ...link, url };
  });
  if (!replaced) next.push({ platform: QUARK_PLATFORM, url });
  return next;
}

/** 迁移行 → 本批 CSV 里的 key（旧行是无前缀写法，靠这一步把夸克链接对起来） */
export function legacyRowKey(title) {
  return String(title).startsWith("大卡-") ? `${CARTETHYIA}-${title}` : String(title);
}

/**
 * dry-run 专用：把「迁移后」的样子套到现有行快照上。
 *
 * 少了这一步，dry-run 会按**迁移前**的 `卡提希娅|大卡-XXX` 去重，而这 3 条迁移后的键是
 * `芙露德莉斯|大卡-XXX` ⇒ 它仨会被误报成「新增」，真实运行又要再插一遍。
 */
export function applyLegacyMigrationSnapshot(rows, legacyRows) {
  const byTitle = new Map(legacyRows.map((r) => [r.title, migrateLegacyRow(r)]));
  return rows.map((row) => {
    const migrated = byTitle.get(row.title);
    return migrated ? { ...row, character: migrated.character, title: migrated.title } : row;
  });
}

/**
 * 生成迁移语句。用 jsonb_populate_recordset 让 Postgres 自己解析 JSON，
 * 标题里的引号 / 括号 / 反斜杠都不会把 SQL 拼坏（同 upload-daily-by-date.mjs 的 buildInsertSql）。
 * 空数组返回 null，调用方据此跳过写库。
 */
export function buildLegacyUpdateSql(records) {
  if (!records.length) return null;
  return `
with incoming as (
  select j.id, j.character, j.title, j.description, j.drive_links
  from jsonb_populate_recordset(null::mods, ${dollarQuote(JSON.stringify(records))}::jsonb) j
), upd as (
  update mods
  set character = i.character,
      title = i.title,
      description = i.description,
      drive_links = i.drive_links
  from incoming i
  where mods.id = i.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}
