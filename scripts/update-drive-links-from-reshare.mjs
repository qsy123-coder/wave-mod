/**
 * 重分享后**覆盖**库内已有 mod 的网盘链接。
 *
 * 背景：网盘分享会过期，用户重分享后夸克/迅雷链接**双双重置**。这类 mod 已入库，
 * 每日脚本按 `character|title` 去重会静默跳过（不报错、不写库），于是前台卡片上
 * 挂的仍是死链 —— 表现是「网站能打开，但点下载进不去」，没有任何告警。
 * 既有的两个脚本都覆盖不了本场景：
 *   · apply-daily-xunlei-by-date.mjs —— 只**追加**迅雷，且已含迅雷就跳过；
 *   · update-xunlei-links.mjs        —— 同样只管迅雷，且数据源是固定的 xunlei-map.json。
 *
 * 本脚本读一个「重分享目录」（结构同每日目录，但不要求 W-YYYY.M.D 命名）：
 *   <dir>/分享结果导出-*.csv   → 夸克新链接
 *   <dir>/分享结果导出-*.xlsx  → 迅雷新链接（可选）
 *
 * 匹配：**分享名（去 .exe）=== 库内 title**，逐字精确，不做模糊兜底。
 *   为什么敢直接对齐 title：本脚本只服务于 title 保留完整 key 的整包类 mod
 *   （EFFECT_BUCKET / UI 全 key / 武器 / 爱弥斯的机甲 等），它们的
 *   resolveCharacterAndTitle 返回的 title 就是 key 原文，与文件名去掉 .exe 后逐字相同。
 *   命中 0 条或 >1 条一律只报告、不写库 —— 宁可让人来看，也不要猜错 mod 把链接挂串。
 *
 * 写入：把 **夸克 / 迅雷** 两个槽位的 url 原地换成新链接（保持平台顺序），
 *   其它网盘（百度等）与数组里其它字段原样保留。缺哪个槽位就补哪个。
 *   预览图（images）与其余列一律不动 —— 重分享只换链接。
 *
 * 改完 drive_links **必须**重发兜底快照 + ping：drive_links 在快照列清单里
 * （scripts/mods-snapshot.sql），网关被锁时前台读的就是快照；不重发等于没改。
 *
 * **还要清香港反代的缓存**（2026-10-30 补）：`/api/mods` 在 nginx 上是
 * `proxy_cache_valid` 长 TTL、且 `proxy_ignore_headers Cache-Control`，
 * `revalidateTag` 只清得掉上游 Next 那一层 —— 不清 nginx 的话，改完这一条
 * 前台卡片照样挂着**旧链接**最长一个 TTL（表现正是「换了分享、站上还是老的」）。
 *
 * 用法:
 *   node scripts/update-drive-links-from-reshare.mjs --dir=<重分享目录>            # dry-run
 *   node scripts/update-drive-links-from-reshare.mjs --dir=<重分享目录> --apply    # 写库
 */

import { readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";

import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";
import { resolveReshareAlias } from "./reshare-title-aliases.mjs";
import { parseXunleiTxt, withXunleiPwd } from "./xunlei-txt-parse.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";

const cliArgs = process.argv.slice(2);
const argValue = (name) => {
  const hit = cliArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
};
const isApply = cliArgs.includes("--apply");
const dirArg = argValue("dir");

if (!dirArg) {
  console.error("❌ 必须用 --dir=<重分享目录> 指定目录（含 分享结果导出-*.csv / *.xlsx）");
  process.exit(1);
}
const DIR = resolve(dirArg);
if (!existsSync(DIR)) {
  console.error(`❌ 目录不存在: ${DIR}`);
  process.exit(1);
}

requireDatabaseUrl();

// ==================== 夸克 CSV 解析 ====================
// 从 scripts/upload-daily-by-date.mjs 原样复制（那边未导出，且模块底部无条件跑 main()，
// 无法 import）。上游改动时请同步这里 —— 两边解析不出同样的 key 就会整批匹配不上。

function parseQuarkCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = [];
  let i = 0;
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.startsWith("创建分享状态")) i = 1;

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

// ==================== 迅雷 xlsx 解析 ====================
// 复用 scripts/parse-daily-xunlei-xlsx.ps1：项目没有声明 zip 依赖，不在 Node 里自己解。
// 该 ps1 按「Root 下的子目录」遍历，所以传父目录 + 目录名当 DirPattern。
// 解析失败降级为「本次没有迅雷链接」而不是抛错：夸克那条仍然该更新。

function loadXunleiIndex(dir) {
  const parent = resolve(dir, "..");
  const dirName = basename(dir);
  const outPath = join(tmpdir(), `wavemod-reshare-xunlei-${randomUUID()}.json`);
  const ps1 = resolve(process.cwd(), "scripts/parse-daily-xunlei-xlsx.ps1");
  try {
    const res = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Root", parent, "-DirPattern", dirName, "-OutJson", outPath],
      { encoding: "utf8" }
    );
    if (res.status !== 0) {
      console.warn(`⚠️  迅雷导出解析失败（退出码 ${res.status}），本次只更新夸克链接`);
      const detail = res.stderr?.trim() || res.stdout?.trim();
      if (detail) console.warn(`   ${detail.split(/\r?\n/).slice(0, 3).join(" | ")}`);
      return new Map();
    }
    const rows = JSON.parse(readFileSync(outPath, "utf8"));
    const index = new Map();
    for (const r of rows) {
      const link = String(r.link ?? "").trim();
      if (!link.startsWith("http")) continue; // 表头行
      const key = String(r.name ?? "").replace(/\.exe$/i, "").trim();
      if (key) index.set(key, { link, pwd: r.pwd || "" });
    }
    // 手抄 txt（2026-10-29 那批迅雷导出只有 txt，没有 xlsx）：只补空位，
    // xlsx 是正式导出，同名时以它为准。与 upload-daily-by-date.mjs 同源逻辑。
    for (const file of readdirSync(dir).filter((f) => /\.txt$/i.test(f))) {
      let text;
      try { text = readFileSync(join(dir, file), "utf8"); } catch { continue; }
      for (const { name, link, pwd } of parseXunleiTxt(text)) {
        if (!index.has(name)) index.set(name, { link, pwd });
      }
    }
    return index;
  } catch (err) {
    console.warn(`⚠️  迅雷导出解析异常：${err.message}，本次只更新夸克链接`);
    return new Map();
  } finally {
    rmSync(outPath, { force: true });
  }
}

// ==================== drive_links 合并 ====================

/**
 * 原地替换夸克 / 迅雷两个槽位的 url，**不改平台顺序、不动其它平台**。
 * 本次没拿到新链接的槽位保留旧值；库里缺的槽位按惯例追加到末尾。
 * （库里现有顺序恒为 夸克 → 迅雷，见 upload-daily-by-date.mjs 的 driveLinks 构造。）
 */
function mergeDriveLinks(current, { quark, xunlei }) {
  const next = [];
  let sawQuark = false;
  let sawXunlei = false;

  for (const entry of Array.isArray(current) ? current : []) {
    const platform = String(entry?.platform ?? "");
    if (platform.includes("夸克") && quark) {
      next.push({ ...entry, url: quark });
      sawQuark = true;
    } else if (platform.includes("迅雷") && xunlei) {
      next.push({ ...entry, url: xunlei });
      sawXunlei = true;
    } else {
      next.push(entry);
    }
  }
  if (quark && !sawQuark) next.push({ platform: "夸克网盘", url: quark });
  if (xunlei && !sawXunlei) next.push({ platform: "迅雷网盘", url: xunlei });
  return next;
}

/** 只把 夸克/迅雷 的 url 挑出来做前后对比，避免整块 jsonb 刷屏 */
function linkSummary(driveLinks) {
  const pick = (kw) => (Array.isArray(driveLinks) ? driveLinks : []).find((d) => String(d?.platform ?? "").includes(kw));
  const q = pick("夸克");
  const x = pick("迅雷");
  return { quark: q?.url ?? null, xunlei: x?.url ?? null };
}

// ==================== 读取重分享目录 ====================

const csvFiles = readdirSync(DIR).filter((fn) => fn.toLowerCase().endsWith(".csv"));
if (csvFiles.length === 0) {
  console.error(`❌ ${DIR} 里没有夸克导出 CSV（分享结果导出-*.csv）`);
  process.exit(1);
}

const quarkByKey = new Map();
for (const f of csvFiles) {
  for (const r of parseQuarkCsv(join(DIR, f))) quarkByKey.set(r.key, r.url);
}
const xunleiByKey = loadXunleiIndex(DIR);

console.log(`📂 目录: ${DIR}`);
console.log(`   夸克导出: ${csvFiles.join(", ")} → ${quarkByKey.size} 条`);
console.log(`   迅雷导出: ${xunleiByKey.size} 条\n`);

// 目录内自检：两个盘覆盖的 key 应当一致，不一致就是漏导出或漏匹配（会静默写半条）
const allKeys = [...new Set([...quarkByKey.keys(), ...xunleiByKey.keys()])].sort();
const onlyQuark = allKeys.filter((k) => quarkByKey.has(k) && !xunleiByKey.has(k));
const onlyXunlei = allKeys.filter((k) => !quarkByKey.has(k) && xunleiByKey.has(k));
if (onlyQuark.length || onlyXunlei.length) {
  console.log("⚠️  目录内两个盘的 key 不一致:");
  onlyQuark.forEach((k) => console.log(`   - 仅夸克有: ${k}`));
  onlyXunlei.forEach((k) => console.log(`   - 仅迅雷有: ${k}`));
  console.log("");
}

// 分享名可能是重分享后的新写法（前缀 / 作者位置 / 切换键写法都变过），
// 别名表把它归一成库内 title 再匹配；未登记的 key 原样查，行为与之前一致。
const titleOf = (key) => resolveReshareAlias(key)?.title ?? key;
const lookupTitles = [...new Set(allKeys.map(titleOf))].sort();

// ==================== 拉库内记录 ====================

const dbMods = await psqlJson(`
select coalesce(
  json_agg(json_build_object(
    'id', id,
    'title', title,
    'character', character,
    'drive_links', drive_links
  )),
  '[]'::json
)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)}
  and title in (${lookupTitles.map((k) => dollarQuote(k)).join(", ")});
`);

if (!Array.isArray(dbMods)) {
  console.error("❌ 查询失败：psql 未返回数组");
  process.exit(1);
}

const byTitle = new Map();
for (const m of dbMods) {
  const t = String(m.title ?? "").trim();
  if (!byTitle.has(t)) byTitle.set(t, []);
  byTitle.get(t).push(m);
}

// ==================== 匹配 + 生成待写 ====================

const toWrite = [];
const unchanged = [];
const unmatched = [];
const ambiguous = [];

for (const key of allKeys) {
  const dbTitle = titleOf(key);
  const hits = byTitle.get(dbTitle) ?? [];
  if (hits.length === 0) { unmatched.push(key); continue; }
  if (hits.length > 1) { ambiguous.push({ key, candidates: hits.map((h) => `${h.id} | ${h.character}`) }); continue; }

  const row = hits[0];
  const quark = quarkByKey.get(key) ?? null;
  // txt 来源的链接不带提取码，拼成自动填码形态再写（xlsx 来源自带 ?pwd=，原样返回）
  const xunleiEntry = xunleiByKey.get(key);
  const xunlei = xunleiEntry ? withXunleiPwd(xunleiEntry.link, xunleiEntry.pwd) : null;
  const afterLinks = mergeDriveLinks(row.drive_links, { quark, xunlei });
  const before = linkSummary(row.drive_links);
  const after = linkSummary(afterLinks);

  if (before.quark === after.quark && before.xunlei === after.xunlei) {
    unchanged.push({ key, character: row.character });
    continue;
  }

  toWrite.push({ key, modId: row.id, character: row.character, title: row.title, before, after, driveLinks: afterLinks });
}

console.log("=== 匹配结果 ===");
console.log(`✅ 待更新: ${toWrite.length}`);
console.log(`⏭️  链接未变(跳过): ${unchanged.length}`);
console.log(`❌ 库内无对应 title: ${unmatched.length}`);
console.log(`⚠️  歧义(同 title 多命中): ${ambiguous.length}\n`);

for (const t of toWrite) {
  console.log(`  ${t.character} | ${t.title}`);
  if (t.key !== t.title) console.log(`      （分享名: ${t.key}）`);
  console.log(`      夸克  ${t.before.quark ?? "(无)"}`);
  console.log(`         →  ${t.after.quark ?? "(无)"}`);
  console.log(`      迅雷  ${t.before.xunlei ?? "(无)"}`);
  console.log(`         →  ${t.after.xunlei ?? "(无)"}`);
}
if (unchanged.length) {
  console.log("\n--- 链接未变（跳过）---");
  unchanged.forEach((u) => console.log(`   ${u.character} | ${u.key}`));
}
if (unmatched.length) {
  console.log("\n--- 库内无对应 title（不写库，请人工确认）---");
  unmatched.forEach((k) => console.log(`   ${k}`));
}
if (ambiguous.length) {
  console.log("\n--- 同 title 多命中（不写库）---");
  ambiguous.forEach((a) => {
    console.log(`   ${a.key}`);
    a.candidates.forEach((c) => console.log(`        ? ${c}`));
  });
}

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未写库。确认无误后加 --apply 执行。");
  process.exit(0);
}
if (toWrite.length === 0) {
  console.log("\n✅ 没有需要写入的记录。");
  process.exit(0);
}

// ==================== 写库 ====================

/**
 * 一批 { id, drive_links } 收成一条 update。
 * jsonb_populate_recordset(null::mods, ...) 让 Postgres 按真实列类型解析 JSON，
 * URL 里的 ? & # 不必手工转义；只取 id 与 drive_links 两列参与赋值，images 等不受影响。
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

console.log(`\n💾 开始写入 ${toWrite.length} 条...`);
let applied = 0;
let failed = 0;
const BATCH = 50;
for (let i = 0; i < toWrite.length; i += BATCH) {
  const slice = toWrite.slice(i, i + BATCH);
  const batchNum = Math.floor(i / BATCH) + 1;
  const totalBatches = Math.ceil(toWrite.length / BATCH);
  try {
    const outcome = await psqlJson(
      buildDriveLinksUpdateSql(slice.map((t) => ({ id: t.modId, drive_links: t.driveLinks })))
    );
    const updated = Number(outcome?.updated ?? 0);
    applied += updated;
    failed += slice.length - updated;
    const missed = slice.length - updated;
    console.log(`  批次 ${batchNum}/${totalBatches}: 更新 ${updated} 条${missed > 0 ? `（${missed} 条 id 未命中）` : ""}`);
  } catch (err) {
    failed += slice.length;
    console.log(`  ❌ 批次 ${batchNum}/${totalBatches} 失败: ${err.message}`);
  }
}
console.log(`\n📊 完成：成功 ${applied}，失败 ${failed}`);

// 有新链接真的写进去了才发快照 + ping。顺序不能反：先发快照、再 ping
// （见 mods-snapshot-export.mjs 的 notifyRevalidate 注释）。
if (applied > 0) {
  await publishSnapshotBestEffort();
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
  purgeHkCacheBestEffort();
}

/**
 * 清香港反代 `/api/mods` 的整层缓存。
 *
 * 与 upload-daily-by-date.mjs 里同名函数同源：nginx 对 `/api/mods` 是长 TTL 的
 * `proxy_cache` 且忽略 `Cache-Control`，`/api/revalidate` 打不到这一层。
 * 只改一条链接也必须清 —— 这条 mod 会出现在首页、/mods、角色筛选、榜单等多个
 * 查询串下，逐个 pattern 清不如整层清（998 条实测秒级，回源重建无副作用）。
 *
 * 失败只告警不翻红：库与快照都已经对了，最坏是 nginx 把旧 JSON 留到 TTL 到期；
 * 但这是「终端全绿、前台纹丝不动」的静默故障，所以把补跑命令打出来。
 */
function purgeHkCacheBestEffort() {
  const result = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/purge-hk-api-cache.mjs"), "--all"],
    { encoding: "utf8", timeout: 180_000 },
  );

  if (result.status === 0) {
    console.log(result.stdout.trim());
    return;
  }

  const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-1)[0] || "未知错误";
  console.warn(`⚠️  香港反代缓存没清掉：${detail}`);
  console.warn("   前台可能继续显示旧链接，补跑：node scripts/purge-hk-api-cache.mjs --all");
}

/**
 * 导出兜底快照并发布到 COS（只做「导出 → 上传」，不含 ping）。
 * 只告警不翻红：数据已经入库，写库成功不该因为快照没发出去而显示成失败；
 * 但这是个静默失效（终端全绿、内容停更），所以告警写足两行。
 * COS 四件套惰性读：本脚本常态用途是「只连库改几条 drive_links」，不该被 COS 卡住启动。
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
