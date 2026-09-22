/**
 * 给「A_每日更新」W-2026.9.10 ~ W-2026.9.19 批次的 mod 补「迅雷网盘」链接。
 *
 * 数据源：`A_每日更新\W-YYYY.M.D\分享结果导出-*.xlsx`（迅雷分享导出），
 *   已由 scripts/parse-daily-xunlei-xlsx.ps1 解析为 JSON：
 *   C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-xunlei-910-919.json
 *
 * 匹配策略（不做模糊匹配——标题映射必须与入库时完全一致，否则会写错 mod）：
 *   1. 分享名去 `.exe` 得到 key；
 *   2. 用与 scripts/upload-daily-by-date.mjs **完全相同**的 resolveCharacterAndTitle
 *      把 key 解析成 (character, title)；
 *   3. 用 dedupKey 归一化后与库内记录比对（容忍「角色-」前缀写法差异）。
 *   命中 0 条 → 未匹配报告；命中 >1 条 → 歧义报告；均不写库。
 *
 * 幂等：已含「迅雷网盘」的 mod 跳过；否则把 { platform:'迅雷网盘', url } 追加到 drive_links 末尾。
 *
 * 用法：
 *   node scripts/apply-daily-xunlei-by-date.mjs            # dry-run，只报告
 *   node scripts/apply-daily-xunlei-by-date.mjs --apply    # 实际写库
 *
 * 可选参数（不传时即上方的 9.10~9.19 默认行为）：
 *   --json=<path>    迅雷导出 JSON
 *   --report=<path>  匹配报告落盘路径（供 emit-daily-xunlei-md.mjs 消费）
 *   --days=W-2026.9.20[,W-2026.9.21]  只处理这些日期目录的记录
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";

import { resolveDakaIfApplicable } from "./daka-classify.mjs";
import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const REPORT_DIR = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod";
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://www.wave-mod.top";

const cliArgs = process.argv.slice(2);
const argValue = (name) => {
  const hit = cliArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
};

const JSON_PATH = argValue("json") || `${REPORT_DIR}/daily-xunlei-910-919.json`;
const REPORT_PATH = argValue("report") || `${REPORT_DIR}/daily-xunlei-910-919-report.json`;
const daysArg = argValue("days");
const filterDays = daysArg
  ? new Set(daysArg.split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const isApply = cliArgs.includes("--apply");

// 直连 Postgres(5432 pooler) 而不是 supabase-js：Supabase 出口配额超限时 REST 网关
// 一律回 402(exceed_egress_quota)，这条链路不受影响。实现见 scripts/psql-db.mjs。
requireDatabaseUrl();

// ==================== 标题映射（必须与 upload-daily-by-date.mjs 保持一致） ====================
// ⚠️ 这段是从 scripts/upload-daily-by-date.mjs 原样复制来的。入库时用什么规则切出
//    (character, title)，这里就必须用同一套规则反解，否则匹配不到（或更糟：匹配到错的 mod）。
//    上游改动时请同步这里。

/** 角色前缀 → 标准角色名，title 去前缀 */
const CHARACTER_PREFIX_MAP = [
  { prefix: "清宵", character: "清宵" },
  { prefix: "清霄", character: "清宵" },
  { prefix: "玄翎", character: "玄翎" },
  { prefix: "洛瑟菈", character: "洛瑟菈" },
  { prefix: "穗穗", character: "穗穗" },
  { prefix: "相里要", character: "相里要" },
  { prefix: "达妮娅", character: "达妮娅" },
  { prefix: "女漂皮肤", character: "女漂" },
  { prefix: "琳奈皮肤", character: "琳奈" },
  { prefix: "千咲皮肤", character: "千咲" },
  { prefix: "千咲", character: "千咲" },
  { prefix: "卡提希娅", character: "卡提希娅" },
  { prefix: "琳奈", character: "琳奈" },
  { prefix: "莫宁", character: "莫宁" },
  { prefix: "卜灵", character: "卜灵" },
  { prefix: "景燃", character: "景燃" },
  { prefix: "绯雪", character: "绯雪" },
  // 2026-09-22 补入：与 upload-daily-by-date.mjs 同步（那边同日为 W-2026.9.22 加的）。
  // 漏同步的后果正是本文件顶部 ⚠️ 说的那种——W-2026.9.22 的
  // `丽贝卡-洁薇塔（90）by woju(1)` 会落默认分支，title 连带前缀一起进 dedupKey。
  // （奥古斯塔落默认分支时恰好也能靠 dedupKey 的前缀归一化命中，属于巧合，不可依赖。）
  { prefix: "丽贝卡", character: "丽贝卡" },
  { prefix: "奥古斯塔", character: "奥古斯塔" },
];

const UI_FULL_KEY_RE = /^(?:.*?全ui|编队界面|编队图片)/;
const WEAPON_PREFIXES = ["浩境粼光"];
const UI_PREFIXES = ["索拉指南"];
/** 独立分类：爱弥斯的机甲 / 爱弥斯大招 → 「爱弥斯的机甲」，title 保留完整 key（同 upload-daily-by-date.mjs） */
const AEMEATH_MECH_PREFIXES = ["爱弥斯的机甲", "爱弥斯大招"];

/** 与 src/lib/mods-domain/sorting.ts 的 CHARACTER_ALIASES 保持一致 */
const CHARACTER_ALIASES = {
  "陆赫斯": "路赫斯",
  "反虚化，ui界面，场景，葫芦，特效等": "UI",
  "千咲皮肤[蜜桃冰]": "千咲",
  "科考摩托": "滑翔翼,翱翔翼,科考摩托",
  "背包 编队 商城 用户界面": "UI",
  "爱弥斯饰品[雪绒豹豹]": "爱弥斯",
};

function normalizeCharacter(character) {
  return CHARACTER_ALIASES[character] ?? character;
}

function resolveCharacterAndTitle(key) {
  if (key.startsWith("尤诺的月环")) {
    return { character: "尤诺", title: key.slice("尤诺".length) };
  }
  for (const p of AEMEATH_MECH_PREFIXES) {
    if (key.startsWith(p)) {
      return { character: "爱弥斯的机甲", title: key };
    }
  }
  // 大卡 → 芙露德莉斯。与 upload-daily-by-date.mjs 同一分支、同一来源
  // （daka-classify.mjs 的纯规则），否则库内已迁移的大卡记录会在这里也匹配不上。
  const daka = resolveDakaIfApplicable(key);
  if (daka) return daka;
  if (UI_FULL_KEY_RE.test(key)) {
    return { character: "UI", title: key };
  }
  for (const p of UI_PREFIXES) {
    if (key.startsWith(p)) {
      const title = key.slice(p.length).replace(/^[-－\s]+/, "").trim() || key;
      return { character: "UI", title };
    }
  }
  for (const p of WEAPON_PREFIXES) {
    if (key.startsWith(p)) {
      return { character: "武器", title: key };
    }
  }
  for (const { prefix, character } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title = key.slice(prefix.length).replace(/^[-－\s]+/, "").trim();
      if (prefix.includes("皮肤")) title = key;
      if (!title) title = key;
      return { character: normalizeCharacter(character), title };
    }
  }
  return { character: normalizeCharacter(key.split(/[-－]/)[0] || key), title: key };
}

/** 去重/查找键：`character|title`，title 开头多余的「角色-」前缀两侧都归一化掉 */
function dedupKey(character, title) {
  const c = String(character ?? "").trim();
  let t = String(title ?? "").trim();
  if (c && t.startsWith(c)) t = t.slice(c.length).replace(/^[-－\s]+/, "").trim();
  return `${c}|${t}`;
}

/**
 * 去掉分享名末尾的「重名后缀」`(1)` / `（2）`。
 *
 * 迅雷上传同名文件时会自动改名追加 `(N)`，而库内 title 来自夸克侧的本名，
 * 于是 W-2026.9.22 的 `丽贝卡-洁薇塔（90）by woju(1).exe` 与库内
 * `丽贝卡 | 洁薇塔（90）by woju` 对不上 —— 不是标题映射不一致，纯粹是上传侧改名。
 *
 * 只在**精确匹配落空后**才用它兜底，且结果必须在库内唯一命中才采纳（见下方循环），
 * 免得把两个真·不同版本的文件（如存在 `xx(1)` 与 `xx(2)` 两条）错并成一条。
 * 故意只认行尾这一个后缀：`小卡-校园JK2.0（内附切换）` 这类名字里的括号不受影响。
 */
function stripRenameSuffix(key) {
  return String(key).replace(/[(（]\d+[)）]$/, "").trim();
}

// ==================== 读取迅雷导出 ====================

if (!existsSync(JSON_PATH)) {
  console.error(`❌ 未找到 ${JSON_PATH}\n   请先运行 scripts/parse-daily-xunlei-xlsx.ps1`);
  process.exit(1);
}
const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const records = raw.filter(
  (r) => r.link && String(r.link).startsWith("http") && (!filterDays || filterDays.has(r.day))
);
console.log(`📥 迅雷导出记录: ${records.length}（原始 ${raw.length}，已剔除表头/坏行）`);
if (filterDays) console.log(`🎯 --days 过滤: ${[...filterDays].join(", ")}`);

// ==================== 拉取库内 mod ====================

const dbMods = await psqlJson(`
select coalesce(
  json_agg(json_build_object(
    'id', id,
    'title', title,
    'character', character,
    'drive_links', drive_links,
    'created_at', created_at
  )),
  '[]'::json
)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)};
`);

if (!Array.isArray(dbMods)) {
  console.error("❌ 查询失败：psql 未返回数组");
  process.exit(1);
}
console.log(`🗄  库内 wuthering-waves mods: ${dbMods.length}`);

const byKey = new Map();
for (const m of dbMods) {
  const k = dedupKey(m.character, m.title);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(m);
}

// ==================== 匹配 ====================

const hasXunlei = (row) =>
  Array.isArray(row.drive_links) && row.drive_links.some((d) => String(d.platform).includes("迅雷"));

const toWrite = [];
const already = [];
const unmatched = [];
const ambiguous = [];

for (const r of records) {
  const key = String(r.name).replace(/\.exe$/i, "").trim();

  // 先按原名精确匹配；落空再退一步去掉迅雷侧的重名后缀 `(N)` 重试（理由见 stripRenameSuffix）。
  // renamed 只作报告用：命中的仍是库内那条本名记录，写的是同一条 mod 的链接。
  let { character, title } = resolveCharacterAndTitle(key);
  let hits = byKey.get(dedupKey(character, title)) || [];
  let renamed = false;

  if (hits.length === 0) {
    const stripped = stripRenameSuffix(key);
    if (stripped !== key) {
      const alt = resolveCharacterAndTitle(stripped);
      const altHits = byKey.get(dedupKey(alt.character, alt.title)) || [];
      if (altHits.length === 1) {
        ({ character, title } = alt);
        hits = altHits;
        renamed = true;
      }
    }
  }

  if (hits.length === 0) {
    unmatched.push({ day: r.day, name: r.name, character, title, link: r.link });
    continue;
  }
  if (hits.length > 1) {
    ambiguous.push({
      day: r.day,
      name: r.name,
      character,
      title,
      link: r.link,
      candidates: hits.map((h) => `${h.id} | ${h.character} | ${h.title}`),
    });
    continue;
  }

  const row = hits[0];
  const entry = {
    day: r.day,
    name: r.name,
    modId: row.id,
    character: row.character,
    title: row.title,
    createdAt: row.created_at,
    link: r.link,
    pwd: r.pwd || "",
    renamed,
  };
  if (hasXunlei(row)) already.push(entry);
  else toWrite.push(entry);
}

// 归属日期校验：目录 W-2026.9.12 的记录 created_at 应落在 2026-09-12（上海时区）。
// 不一致说明命中的是同名的旧记录 —— 链接会挂到别的日期上，必须人工确认。
const dayOf = (iso) => {
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000); // UTC → 上海
  return `${t.getUTCFullYear()}-${t.getUTCMonth() + 1}-${t.getUTCDate()}`;
};
const dateMismatch = [...toWrite, ...already].filter((e) => {
  const m = /^W-(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(e.day);
  return m && dayOf(e.createdAt) !== `${m[1]}-${Number(m[2])}-${Number(m[3])}`;
});

console.log("\n=== 匹配结果 ===");
console.log(`✅ 待补迅雷: ${toWrite.length}`);
console.log(`⏭️  已含迅雷(跳过): ${already.length}`);
console.log(`⚠️  歧义(多命中): ${ambiguous.length}`);
console.log(`❌ 未匹配: ${unmatched.length}`);
console.log(`🕒 归属日期不一致: ${dateMismatch.length}`);

console.log("\n===== 待写入 =====");
for (const t of toWrite) {
  console.log(`  [${t.day}] ${t.character} | ${t.title}\n      ← ${t.name}\n      → ${t.link}`);
  // 靠去重名后缀命中的，单独标出来：它没有走「同名精确匹配」，值得扫一眼
  if (t.renamed) console.log(`      ⚠️  原名未被精确命中，去掉行尾 (N) 后缀后才匹配到上面这条`);
}

if (already.length) {
  console.log("\n===== 已含迅雷（跳过） =====");
  for (const t of already) console.log(`  [${t.day}] ${t.character} | ${t.title}`);
}
if (ambiguous.length) {
  console.log("\n===== 歧义（不写库） =====");
  for (const a of ambiguous) console.log(`  [${a.day}] ${a.name}\n      ${a.candidates.join("\n      ")}`);
}
if (unmatched.length) {
  console.log("\n===== 未匹配（库内无对应 mod） =====");
  for (const u of unmatched) console.log(`  [${u.day}] ${u.name}  →  解析为 ${u.character} | ${u.title}`);
}
if (dateMismatch.length) {
  console.log("\n===== 归属日期与目录不符（命中了旧记录，请人工确认） =====");
  for (const e of dateMismatch) {
    console.log(`  [${e.day}] ${e.character} | ${e.title}  →  库内 created_at=${e.createdAt}`);
  }
}

writeFileSync(
  REPORT_PATH,
  JSON.stringify({ toWrite, already, ambiguous, unmatched, dateMismatch }, null, 2),
  "utf8"
);
console.log(`\n📄 报告: ${REPORT_PATH}`);

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未写库。确认无误后加 --apply 执行。");
  process.exit(0);
}

// ==================== 写库 ====================

/**
 * 把一批 { id, drive_links } 编成一条 update。
 *
 * jsonb_populate_recordset(null::mods, ...) 让 Postgres 按 mods 的真实列类型解析
 * JSON —— drive_links 直接就是 jsonb，URL 里的引号、& 不必手工转义。这里只从解析
 * 结果里取 id 与 drive_links 两列，其余列不参与赋值。
 */
function buildDriveLinksUpdateSql(rows) {
  return `
with incoming as (
  select j.id, j.drive_links
  from jsonb_populate_recordset(null::mods, ${dollarQuote(JSON.stringify(rows))}::jsonb) j
),
upd as (
  update mods
  set drive_links = incoming.drive_links
  from incoming
  where mods.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

const byId = new Map(dbMods.map((m) => [m.id, m]));
console.log(`\n💾 开始写入 ${toWrite.length} 条...`);
let applied = 0;
let failed = 0;
const BATCH = 50;
for (let i = 0; i < toWrite.length; i += BATCH) {
  const slice = toWrite.slice(i, i + BATCH);
  const batchNum = Math.floor(i / BATCH) + 1;
  const totalBatches = Math.ceil(toWrite.length / BATCH);
  // 原先是逐条并发 update，现在收成一条语句：同一批内原子生效，也省掉几十次往返。
  const payload = slice.map((t) => {
    const cur = Array.isArray(byId.get(t.modId)?.drive_links) ? byId.get(t.modId).drive_links : [];
    return { id: t.modId, drive_links: [...cur, { platform: "迅雷网盘", url: t.link }] };
  });
  try {
    const outcome = await psqlJson(buildDriveLinksUpdateSql(payload));
    const updated = Number(outcome?.updated ?? 0);
    applied += updated;
    failed += payload.length - updated;
    const missed = payload.length - updated;
    console.log(`  批次 ${batchNum}/${totalBatches}: 更新 ${updated} 条${missed > 0 ? `（${missed} 条 id 未命中）` : ""}`);
  } catch (err) {
    failed += payload.length;
    console.log(`  ❌ 批次 ${batchNum}/${totalBatches} 失败: ${err.message}`);
  }
}
console.log(`\n📊 完成：成功 ${applied}，失败 ${failed}`);

// 有新链接真的写进去了才发布快照 + 通知前台。dry-run 与「全部已含迅雷链接」
// 都到不了这里（前者上面已 return，后者 applied 为 0）。
//
// 为什么这个脚本也必须发：它改的 drive_links **在快照列清单里**
// （scripts/mods-snapshot.sql），网关被锁时前台读的是兜底快照，不重发就等于没改。
// 顺带补上一个既有缺口：本脚本此前连 ping 都没有，网关正常时列表卡片上的迅雷按钮
// 也要等满 6 小时 TTL 才出现。
if (applied > 0) {
  // 顺序不能反：先发布快照、再 ping（见 notifyRevalidate 的注释）
  await publishSnapshotBestEffort();
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
}

/**
 * 导出兜底快照并发布到 COS（只做「导出 → 上传」，**不含 ping**）。
 *
 * 只告警不翻红：数据已经入库了，一次成功的写库不该因为快照没发出去而显示成失败。
 * 但这个失效是最难发现的那种（终端全绿、内容静默停更），所以告警写足两行。
 *
 * COS 环境变量在这里**惰性**读，不在启动时校验：本脚本的常态用途是「只连库改几条
 * drive_links」，不该因为缺 COS 四件套就跑不起来。
 */
async function publishSnapshotBestEffort() {
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  const secretId = process.env.COS_SECRET_ID?.trim();
  const secretKey = process.env.COS_SECRET_KEY?.trim();

  if (!bucket || !region || !secretId || !secretKey) {
    console.warn("⚠️  缺少 COS 环境变量，跳过兜底快照发布");
    console.warn("   库内数据已就绪；但若 Supabase 网关被锁，前台仍会显示旧快照内容。");
    return;
  }

  try {
    await publishSnapshotToCos({
      cos: new COS({ SecretId: secretId, SecretKey: secretKey }),
      bucket,
      region,
      databaseUrl: process.env.DATABASE_URL?.trim(),
      sqlPath: resolve(process.cwd(), "scripts/mods-snapshot.sql"),
      outPath: resolve(process.cwd(), SNAPSHOT_REL_PATH),
      rawPath: join(tmpdir(), "wavemod-snapshot-raw.json"),
    });
  } catch (err) {
    console.warn(`⚠️  兜底快照发布失败: ${err.message}`);
    console.warn("   库内数据已就绪；但若 Supabase 网关被锁，前台仍会显示旧快照内容。");
  }
}
