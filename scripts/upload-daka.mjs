/**
 * 上传「大卡」批次（平铺目录，不是 W-YYYY.M.D 日期目录）：夸克 CSV + exe/预览图 → COS + Postgres。
 *
 * 与 upload-daily-by-date.mjs 的区别：
 *   1. 数据是**平铺**在一个目录里（`D:\BaiduNetdiskDownload\大卡`），没有日期子目录，
 *      所以 created_at 由 --date 决定（默认今天，上海中午），而不是从目录名推导。
 *   2. 分类规则不是「角色前缀表」而是本批专用的三条（见 scripts/daka-classify.mjs）：
 *      「卡提希娅-大卡-*」与「大卡提希娅的剑/武器-*」→ 新分类 **芙露德莉斯**（用户明确
 *      授权新建，头像暂与卡提希娅共用）；「卡提希娅玩偶/的手偶/的草」→ 卡提希娅。
 *   3. 多一步**旧行迁移**：库内已有 3 条同类记录挂在卡提希娅下，按 (character,title) 去重
 *      的话它们会与本次的 3 个文件各插一份（同一 mod 在两个分类下各出现一次），
 *      所以先把这 3 行的 character 改到芙露德莉斯，再按新的键去重。顺带把这 3 条的
 *      夸克链接换成 CSV 里的新链接（用户确认：它们是重分享过的），迅雷链接保留。
 *
 * 写库走 psql 直连（scripts/psql-db.mjs）而不是 supabase-js：Supabase 出口配额超限时
 * REST 网关一律回 402(exceed_egress_quota)，这条链路不受影响，也不烧出口流量。
 *
 * 用法:
 *   node scripts/upload-daka.mjs --dry-run          # 只解析 + 分类 + 比对 + 转 WebP，不上传不入库
 *   node scripts/upload-daka.mjs                    # 正式上传（含旧行迁移）
 *   node scripts/upload-daka.mjs --date=2026.9.21   # 指定归属日期（默认今天）
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

import {
  FLEURDELYS,
  applyLegacyMigrationSnapshot,
  buildLegacyUpdateSql,
  legacyRowKey,
  migrateLegacyRow,
  resolveDakaTarget,
} from "./daka-classify.mjs";
import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// ==================== 配置 ====================

/** 本批次的源目录：平铺的 exe + png + 夸克导出 CSV（xlsx 是同一份导出的另一种格式，不读） */
const DIR = String.raw`D:\BaiduNetdiskDownload\大卡`;

const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const GAME_KEY = "wuthering-waves";
const GAME_VERSION = "未标注";
const DEFAULT_VERSION = "未标注";

/** 站点地址：默认线上域名；本地调试可设 WAVE_MOD_SITE_URL=http://localhost:3000 */
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://www.wave-mod.top";

const XXMI_GUIDE = [
  "1. 下载并解压对应 MOD 压缩包。",
  "2. 打开 XXMI Launcher，确认当前游戏版本与 MOD 版本匹配。",
  "3. 将 MOD 文件夹复制到 XXMI Mods 目录。",
  "4. 返回启动器启用对应角色模组后进入游戏检查效果。",
].join("\n");

/**
 * 库内已有、且与本批源文件是**同一个 mod** 的 3 条记录（挂卡提希娅下），逐个核对过：
 *   - `大卡-休闲服装`        2026-09-21 中午那批（就是本目录的 卡提希娅-大卡-休闲服装）
 *   - `大卡-时韵 Mk3（；)og狩野樱` 2026-09-03
 *   - `卡提希娅-大卡-神之御装（0）by woju` 2026-09-05（唯一带全前缀的遗留写法）
 * 查询写死 title 而不是用 `like '大卡-%'`：后者会把将来任何裸「大卡-」行都卷进来。
 */
const LEGACY_TITLES = [
  "卡提希娅-大卡-神之御装（0）by woju",
  "大卡-休闲服装",
  "大卡-时韵 Mk3（；)og狩野樱",
];

// ==================== 数据库连接 ====================

requireDatabaseUrl();

// ==================== COS Client ====================

const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!cosSecretId || !cosSecretKey || !cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS 环境变量");
  process.exit(1);
}
const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey });

function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      { Bucket: cosBucket, Region: cosRegion, Key: objectKey, Body: body, ContentType: contentType },
      (err, data) => {
        if (err) rejectPromise(new Error(`COS 上传失败: ${err.message}`));
        else resolvePromise(data);
      }
    );
  });
}

function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "mod"
  );
}

// ==================== 日期 ====================

/** 解析 --date=2026.9.21；缺省用今天（上海时区，避免本地时区差一天） */
function resolveDate() {
  const arg = args.find((a) => a.startsWith("--date="));
  if (arg) {
    const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(arg.slice("--date=".length).trim());
    if (!m) {
      console.error("❌ --date 需要形如 2026.9.21");
      process.exit(1);
    }
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  const shanghai = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    y: shanghai.getUTCFullYear(),
    m: shanghai.getUTCMonth() + 1,
    d: shanghai.getUTCDate(),
  };
}

/** 该日期"上海中午"的 ISO 时间戳，保证 DailyUpdate 按该日期归组（同 upload-daily-by-date.mjs） */
function noonShanghaiISO({ y, m, d }) {
  const padded = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return `${padded}T04:00:00.000Z`;
}

// ==================== CSV 解析（夸克，含多行引号字段） ====================

function parseQuarkCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = [];
  let i = 0;
  const lines = raw.split(/\r?\n/);
  // 夸克导出的 CSV 带 UTF-8 BOM，不先剥掉的话表头行会当数据行解析
  // （那行没有 URL，不会真的入库，但白跑一遍解析逻辑）
  if (lines[0]?.replace(/^\uFEFF/, "").startsWith("创建分享状态")) i = 1;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const firstComma = line.indexOf(",");
    if (firstComma === -1) { i++; continue; }
    let rest = line.slice(firstComma + 1);

    let shareName;
    if (rest.startsWith('"')) {
      const endQuote = rest.indexOf('",', 1);
      if (endQuote === -1) { i++; continue; }
      shareName = rest.slice(1, endQuote);
      rest = rest.slice(endQuote + 2);
    } else {
      const nextComma = rest.indexOf(",");
      if (nextComma === -1) { i++; continue; }
      shareName = rest.slice(0, nextComma);
      rest = rest.slice(nextComma + 1);
    }

    let shareContent = "";
    if (rest.startsWith('"')) {
      rest = rest.slice(1);
      const contentLines = [];
      while (i < lines.length) {
        const cl = rest;
        const endIdx = cl.indexOf('",');
        if (endIdx !== -1) {
          contentLines.push(cl.slice(0, endIdx));
          rest = cl.slice(endIdx + 2);
          break;
        }
        if (cl.endsWith('"')) {
          contentLines.push(cl.slice(0, -1));
          i++;
          rest = lines[i]?.trim() || "";
          break;
        }
        contentLines.push(cl);
        i++;
        if (i >= lines.length) break;
        rest = lines[i];
      }
      shareContent = contentLines.join("\n");
    } else {
      const nextComma = rest.indexOf(",");
      if (nextComma !== -1) {
        shareContent = rest.slice(0, nextComma);
        rest = rest.slice(nextComma + 1);
      } else {
        shareContent = rest;
        rest = "";
      }
    }

    const remainingParts = rest.split(",");
    const urlMatch = shareContent.match(/https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?pwd=[^&\s]+)?/);
    const url = urlMatch ? urlMatch[0] : "";
    const filename = shareName.trim();
    const key = filename.replace(/\.exe$/i, "");
    if (key && url) records.push({ key, filename, url, code: remainingParts[0]?.trim() || "" });
    i++;
  }
  return records;
}

// ==================== 去重键 ====================

/**
 * 去重键：`character|title`，但把 title 开头重复的「角色-」前缀归一化掉。
 * 与 upload-daily-by-date.mjs:291 / apply-daily-xunlei-by-date.mjs 完全一致（三处必须同步）——
 * 本批的关键作用：迁移后的旧行（`芙露德莉斯|大卡-休闲服装`）与本次解析出的同一条
 * （title 已剥成 `大卡-休闲服装`）能对上，从而避免重复入库。
 */
function dedupKey(character, title) {
  const c = String(character ?? "").trim();
  let t = String(title ?? "").trim();
  if (c && t.startsWith(c)) t = t.slice(c.length).replace(/^[-－\s]+/, "").trim();
  return `${c}|${t}`;
}

// ==================== 图片索引（顶层，png 优先） ====================

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const PREFERRED_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// 图片名可能带尾随 UUID（如「...by SlugCat-31f20660-….png」），索引 key 去掉该段，
// 使其与 exe 的 base 精确对应（同 upload-daily-by-date.mjs）
const UUID_SUFFIX_RE = /-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function buildImageIndex(dir) {
  const byBase = new Map();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const indexKey = basename(e.name, ext).replace(UUID_SUFFIX_RE, "");
    if (!byBase.has(indexKey)) byBase.set(indexKey, []);
    byBase.get(indexKey).push({ file: join(dir, e.name), ext });
  }
  const map = new Map();
  for (const [base, list] of byBase) {
    list.sort((a, b) => PREFERRED_EXTS.indexOf(a.ext) - PREFERRED_EXTS.indexOf(b.ext));
    map.set(base, list[0].file);
  }
  return map;
}

// ==================== 图片转换 ====================

async function convertToWebP(imagePath) {
  const fileBuffer = readFileSync(imagePath);
  const webpBuffer = await sharp(fileBuffer)
    .resize({ width: 750, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const reduction = (((fileBuffer.length - webpBuffer.length) / fileBuffer.length) * 100).toFixed(0);
  return {
    buffer: webpBuffer,
    origSizeKB: parseFloat((fileBuffer.length / 1024).toFixed(1)),
    webpSizeKB: parseFloat((webpBuffer.length / 1024).toFixed(1)),
    reduction,
  };
}

// ==================== 入库 SQL 生成 ====================

/** 与 results 里的字段一一对应；其余列（计数器、updated_at 等）交给库表默认值 */
const INSERT_COLUMNS = [
  "id",
  "title",
  "character",
  "game_key",
  "game_version",
  "version",
  "description",
  "download_url",
  "drive_links",
  "nsfw",
  "is_published",
  "is_available",
  "images",
  "xxmi_install_guide",
  "mod_author_url",
  "video_url",
  "created_by",
  "created_at",
];

/**
 * 把一批记录编成一条 insert 语句（同 upload-daily-by-date.mjs:444）。
 *
 * 用 jsonb_populate_recordset(null::mods, ...) 让 Postgres 按 mods 的真实列类型自己解析
 * JSON —— text[]、jsonb、timestamptz、boolean 都不必手写转义，标题里的引号 / 括号 /
 * 反斜杠也不会把 SQL 拼坏。where not exists 是第二道去重：上游已用 existingSet 跳过重复，
 * 这里再兜一次，防止脚本重跑插出双份。
 */
function buildInsertSql(batch) {
  const columnList = INSERT_COLUMNS.join(", ");
  const selectList = INSERT_COLUMNS.map((column) => `j.${column}`).join(", ");

  return `
with incoming as (
  select * from jsonb_populate_recordset(null::mods, ${dollarQuote(JSON.stringify(batch))}::jsonb)
),
ins as (
  insert into mods (${columnList})
  select ${selectList}
  from incoming j
  where not exists (
    select 1
    from mods m
    where m.game_key = j.game_key
      and m.character = j.character
      and m.title = j.title
  )
  returning 1
)
select json_build_object('inserted', (select count(*) from ins))::text;
`;
}

// ==================== 主流程 ====================

async function main() {
  const startTime = Date.now();
  if (isDryRun) console.log("🔍 DRY-RUN 模式：解析 + 分类 + 转 WebP，不实际上传/入库。\n");

  if (!existsSync(DIR)) {
    console.error(`❌ 找不到源目录 ${DIR}`);
    process.exit(1);
  }

  const date = resolveDate();
  const created_at = noonShanghaiISO(date);
  const dateLabel = `${date.y}-${date.m}-${date.d}`;

  // 1. 解析 CSV（本批只有一份夸克导出）
  const csvs = readdirSync(DIR).filter((fn) => fn.toLowerCase().endsWith(".csv"));
  if (csvs.length === 0) {
    console.error(`❌ ${DIR} 下没有 CSV`);
    process.exit(1);
  }
  const records = [];
  for (const f of csvs) records.push(...parseQuarkCsv(join(DIR, f)));

  // 目录内去重（同 key + 同链接）
  const unique = [];
  const seen = new Set();
  for (const r of records) {
    const k = `${r.key}|${r.url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
  }
  console.log(`📄 CSV ${csvs.length} 份：解析 ${records.length} 条，去重后 ${unique.length} 条`);

  // 2. 目录 ↔ CSV 双向核对。这一步是防**静默漏传**：CSV 里没有的 exe 拿不到分享链接，
  //    直接跳过（与 upload-daily-by-date.mjs 同），但要明说出来了多少。
  const exeKeys = new Set(
    readdirSync(DIR)
      .filter((fn) => fn.toLowerCase().endsWith(".exe"))
      .map((fn) => fn.replace(/\.exe$/i, ""))
  );
  const csvKeys = new Set(unique.map((r) => r.key));
  const exeWithoutCsv = [...exeKeys].filter((k) => !csvKeys.has(k));
  const csvWithoutExe = [...csvKeys].filter((k) => !exeKeys.has(k));
  console.log(`📦 目录 exe ${exeKeys.size} 个 ↔ CSV ${csvKeys.size} 条`);
  if (exeWithoutCsv.length) {
    console.log(`⚠️  目录里有 exe 但 CSV 没有分享记录（**不会入库**，共 ${exeWithoutCsv.length}）:`);
    exeWithoutCsv.forEach((k) => console.log(`   - ${k}`));
  }
  if (csvWithoutExe.length) {
    console.log(`⚠️  CSV 有分享但目录里没有 exe（会用占位图入库，共 ${csvWithoutExe.length}）:`);
    csvWithoutExe.forEach((k) => console.log(`   - ${k}`));
  }

  // 3. 分类（规则见 scripts/daka-classify.mjs；冲突形态直接报错停）
  const resolved = [];
  const fallbackKeys = [];
  for (const r of unique) {
    let target;
    try {
      target = resolveDakaTarget(r.key);
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
    if (target.fallback) fallbackKeys.push(`${target.character} | ${target.title}  ← ${r.key}`);
    resolved.push({ ...r, ...target });
  }
  if (fallbackKeys.length) {
    console.log(`\n⚠️  走了「其它都归 ${FLEURDELYS}」的兜底分支（本批应为 0），请确认：`);
    fallbackKeys.forEach((k) => console.log(`   - ${k}`));
  }

  // 4. 取库内旧行（迁移对象）。查询**同时覆盖「还没迁」与「已迁过」两种状态**——
  //    中途断连（校园网到 pooler 会偶发 SSL EOF）后重跑必须幂等，否则第二次跑会因为
  //    「按旧分类查不到」而中止，而库里其实已经是迁移后的状态。
  const migratedTitles = LEGACY_TITLES.map((t) => migrateLegacyRow({ title: t }).title);
  const legacyFound = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id, 'title', title, 'character', character, 'drive_links', drive_links
)), '[]'::json)::text
from mods
where (character = '卡提希娅' and title in (${LEGACY_TITLES.map((t) => dollarQuote(t)).join(", ")}))
   or (character = ${dollarQuote(FLEURDELYS)} and title in (${migratedTitles
     .map((t) => dollarQuote(t))
     .join(", ")}));
`);
  if (legacyFound.length !== LEGACY_TITLES.length) {
    console.error(
      `❌ 预期 ${LEGACY_TITLES.length} 条待迁移旧行，实际查到 ${legacyFound.length} 条；` +
        `先核清再跑（否则这 3 个 mod 会在两个分类下各出现一次）`
    );
    process.exit(1);
  }
  const legacyRows = legacyFound.filter((r) => r.character !== FLEURDELYS);
  const alreadyMigratedRows = legacyFound.filter((r) => r.character === FLEURDELYS);
  if (alreadyMigratedRows.length) {
    console.log(
      `ℹ️  ${alreadyMigratedRows.length} 条旧行已经是 ${FLEURDELYS}（上次跑到一半断过），本次不再迁移`
    );
  }

  // 4a. 迁移预览：现状 → 目标，以及本批 CSV 里的夸克链接是否与库内一致
  const byCsvKey = new Map(resolved.map((r) => [r.key, r]));
  const migrationRecords = legacyRows.map((row) =>
    migrateLegacyRow(row, { quarkUrl: byCsvKey.get(legacyRowKey(row.title))?.url })
  );
  console.log(`\n🔀 旧行迁移（${legacyRows.length} 条待迁，卡提希娅 → ${FLEURDELYS}）:`);
  for (const [index, row] of legacyRows.entries()) {
    const next = migrationRecords[index];
    const csv = byCsvKey.get(legacyRowKey(row.title));
    const oldQuark = (Array.isArray(row.drive_links) ? row.drive_links : []).find(
      (l) => l.platform === "夸克网盘"
    );
    const linkNote = !csv
      ? "⚠️ 本批 CSV 里没有对应分享，夸克链接保持原样"
      : oldQuark?.url === csv.url
        ? "夸克链接与库内一致"
        : `↻ 夸克链接更新：${oldQuark?.url ?? "（库内无）"} → ${csv.url}`;
    console.log(`   - ${row.title}  →  ${next.character} | ${next.title}   [${linkNote}]`);
  }

  // 5. 正式运行时先迁移，再读去重集合 —— 顺序不能反：
  //    迁移前那 3 条的键是 `卡提希娅|大卡-XXX`，迁移后才是 `芙露德莉斯|大卡-XXX`。
  if (!isDryRun && migrationRecords.length > 0) {
    const sql = buildLegacyUpdateSql(migrationRecords);
    try {
      const outcome = await psqlJson(sql);
      const updated = Number(outcome?.updated ?? 0);
      console.log(`   ✅ 已迁移 ${updated} 条`);
      if (updated !== migrationRecords.length) {
        console.error("❌ 迁移影响行数与预期不符，中止（避免重复入库）");
        process.exit(1);
      }
    } catch (err) {
      console.error(`❌ 旧行迁移失败，中止: ${err.message}`);
      process.exit(1);
    }
  }

  let existingRows = await psqlJson(`
select coalesce(
  json_agg(json_build_object('title', title, 'character', character)),
  '[]'::json
)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)};
`);
  if (!Array.isArray(existingRows)) {
    console.error("❌ 查询现有记录失败：psql 未返回数组");
    process.exit(1);
  }
  // dry-run 没真的改库，就按「迁移后」的样子算去重集合，否则这 3 条会被误报成新增
  if (isDryRun) existingRows = applyLegacyMigrationSnapshot(existingRows, legacyRows);
  const existingSet = new Set(existingRows.map((m) => dedupKey(m.character, m.title)));
  // 去重时要把「已迁过」的那部分也算进「迁移跳过」而不是「与库内重复」，否则
  // 上一次跑完迁移、这一次重跑时，这 3 条会被误报成“重复” —— 用户会以为漏了 3 条。
  const legacyKeys = new Set(
    legacyFound.map((r) => {
      const next = migrateLegacyRow(r);
      return dedupKey(next.character, next.title);
    })
  );
  console.log(`\n🗄  现有 mod 记录: ${existingRows.length}`);

  // 6. 去重 + 传图 + 组装记录
  const imageMap = buildImageIndex(DIR);
  console.log(`🖼  预览图索引: ${imageMap.size} 个唯一 base\n`);

  const results = [];
  const placeholderKeys = [];
  const skipDupKeys = [];
  const migratedKeys = [];
  const charCount = {};
  let matchedImage = 0;
  let placeholder = 0;

  for (const record of resolved) {
    const { character, title } = record;
    const key = dedupKey(character, title);
    if (existingSet.has(key)) {
      if (legacyKeys.has(key)) migratedKeys.push(`${character} | ${title}`);
      else skipDupKeys.push(`${character} | ${title}`);
      continue;
    }

    const modId = randomUUID();
    const versionMatch = title.match(/v(\d+[\d.]*)/i);
    const version = versionMatch ? `v${versionMatch[1]}` : DEFAULT_VERSION;

    const imagePath = imageMap.get(record.key) || null;
    let imageUrl;
    if (!imagePath) {
      imageUrl = PLACEHOLDER_IMAGE_URL;
      placeholder++;
      placeholderKeys.push(`${character} | ${title}`);
    } else {
      matchedImage++;
      try {
        const { buffer, origSizeKB, webpSizeKB, reduction } = await convertToWebP(imagePath);
        const objectKey = `mods/${slugify(character)}/${modId}/preview.webp`;
        if (isDryRun) {
          imageUrl = buildCosUrl(objectKey);
          console.log(`   🖼  ${character} | ${title}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
        } else {
          await uploadToCos(objectKey, buffer, "image/webp");
          imageUrl = buildCosUrl(objectKey);
          console.log(`   ✅ ${character} | ${title}`);
        }
      } catch (err) {
        console.error(`   ❌ ${record.key}: ${err.message}`);
        imageUrl = PLACEHOLDER_IMAGE_URL;
        placeholder++;
        placeholderKeys.push(`${character} | ${title}`);
      }
    }

    charCount[character] = (charCount[character] ?? 0) + 1;
    results.push({
      id: modId,
      title,
      character,
      game_key: GAME_KEY,
      game_version: GAME_VERSION,
      version,
      description: `${character} ${title} MOD，夸克网盘下载。`,
      download_url: null,
      drive_links: [{ platform: "夸克网盘", url: record.url }],
      nsfw: false,
      is_published: true,
      is_available: true,
      images: [imageUrl],
      xxmi_install_guide: XXMI_GUIDE,
      mod_author_url: null,
      video_url: null,
      created_by: null,
      created_at, // 归属 --date（默认今天），保证每日更新页按日期分组
    });
  }

  // 7. 汇总
  console.log(`\n✅ 匹配预览图: ${matchedImage}，占位图: ${placeholder}`);
  if (migratedKeys.length) {
    console.log(`\n🔀 旧行迁移（不再重复入库）: ${migratedKeys.length}`);
    migratedKeys.forEach((k) => console.log(`   - ${k}`));
  }
  if (skipDupKeys.length) {
    console.log(`\n⏭️  与库内已有记录重复跳过: ${skipDupKeys.length}`);
    skipDupKeys.forEach((k) => console.log(`   - ${k}`));
  }
  console.log(`\n=== 按分类汇总 (待入库 ${results.length} 条, created_at=${created_at}) ===`);
  for (const [c, n] of Object.entries(charCount).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${c.padEnd(20)} ${n}`);
  }
  if (placeholderKeys.length) {
    console.log(`\n⚠️  使用占位图（源目录无预览图）:`);
    placeholderKeys.forEach((k) => console.log(`   - ${k}`));
  }

  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN: 跳过入库，共 ${results.length} 条记录`);
    console.log(`⏱ 耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return;
  }

  // 8. 写库
  console.log(`\n💾 批量写入数据库 (${results.length} 条)...`);
  const BATCH_SIZE = 50;
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(results.length / BATCH_SIZE);
    try {
      const outcome = await psqlJson(buildInsertSql(batch));
      const written = Number(outcome?.inserted ?? 0);
      inserted += written;
      const skipped = batch.length - written;
      console.log(`   ✅ 批次 ${batchNum}/${totalBatches}: 写入 ${written} 条${skipped > 0 ? `，去重跳过 ${skipped} 条` : ""}`);
    } catch (err) {
      console.error(`   ❌ 批次 ${batchNum}/${totalBatches} 失败: ${err.message}`);
      failed += batch.length;
    }
  }

  console.log(
    `\n📊 完成: 成功 ${inserted} 条, 失败 ${failed} 条 (耗时 ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} 分钟)`
  );

  // 9. 发快照 + ping（有写入或有迁移时才发）
  //    顺序不能反：先发 COS、再 ping（理由见 mods-snapshot-export.mjs 的 notifyRevalidate 注释）。
  //    迁移也必须走到这里：它改的是 character/title/description，三者都在快照列清单里。
  if (inserted > 0 || migratedKeys.length > 0) {
    await publishSnapshotBestEffort();
    await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
  }
}

/**
 * 导出兜底快照并发布到 COS（只做「导出 → 上传」，**不含 ping**）。
 *
 * 为什么必须发：Supabase 网关被锁（exceed_egress_quota，REST/Auth 一律 402）时，
 * 前台读的是兜底快照，而快照的本地那份**只能在构建时打进部署** —— 不重发这一次，
 * 新入库的 mod 在锁定期就看不见（2026-09-21「当天 16 条 mod 没有迅雷按钮」即此）。
 * 读侧实现见 src/lib/mods-domain/snapshot.ts。
 *
 * 只告警不翻红：数据已经入库了，一次成功的上传不该因为快照没发出去而显示成失败。
 * 但这个失效是最难发现的那种（终端全绿、内容静默停更），所以告警写足两行。
 */
async function publishSnapshotBestEffort() {
  try {
    await publishSnapshotToCos({
      cos,
      bucket: cosBucket,
      region: cosRegion,
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

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
