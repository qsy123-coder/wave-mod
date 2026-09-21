/**
 * 上传「A_每日更新」按日期子目录批次 Mod：夸克 CSV + 预览图 → 腾讯云 COS + Supabase。
 *
 * 与 upload-a-daily.mjs 的区别：
 *   1. 数据组织为日期子目录 W-YYYY.M.D（每目录一个 CSV + exe + 预览图；
 *      预览图在顶层或「预览图」子目录）。
 *   2. 每条记录显式设置 created_at = 该目录日期中午(上海时区)，保证每日更新页
 *      按 9.4 / 9.5 / 9.6 分组，而不会全部落到"今天"。
 *
 * 用法:
 *   node scripts/upload-daily-by-date.mjs --dry-run   # 只解析 + 匹配 + 转 WebP，不上传不入库
 *   node scripts/upload-daily-by-date.mjs              # 正式上传
 *   node scripts/upload-daily-by-date.mjs --dates=2026.9.11,2026.9.12
 *                                                      # 只处理指定日期目录（其余目录跳过）
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// --dates=2026.9.11,2026.9.12 → 只处理这些日期目录；未指定则处理全部
const datesArg = args.find((a) => a.startsWith("--dates="));
const filterDates = datesArg
  ? new Set(
      datesArg
        .slice("--dates=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        // 归一化为 YYYY.M.D（容忍 09.11 这种补零写法）
        .map((s) => {
          const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(s);
          return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : s;
        })
    )
  : null;

// ==================== 配置 ====================

const BASE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;

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

const SKIP_PREFIXES = [];

/** 角色前缀 → 标准角色名，title 去前缀 */
const CHARACTER_PREFIX_MAP = [
  { prefix: "清宵", character: "清宵" },
  { prefix: "清霄", character: "清宵" }, // 变体归一化
  { prefix: "玄翎", character: "玄翎" },
  { prefix: "洛瑟菈", character: "洛瑟菈" },
  { prefix: "穗穗", character: "穗穗" },
  { prefix: "相里要", character: "相里要" },
  { prefix: "达妮娅", character: "达妮娅" },
  { prefix: "女漂皮肤", character: "女漂" }, // 「女漂皮肤{星火永明]-…」归女漂
  { prefix: "琳奈皮肤", character: "琳奈" }, // 「琳奈皮肤[薄荷糖]-…」归琳奈
  // 「千咲皮肤{蜜桃冰]-丰汝肥屯…」——`{`/`]` 是 `[`/`]` 的笔误变体，
  // 故用前缀而非全等别名匹配；库内先例 `千咲 | 千咲皮肤[蜜桃冰]-蜜桃啵啵冰v1.1` 同样保留完整 title
  { prefix: "千咲皮肤", character: "千咲" },
  // 裸「千咲-」：库内 164 条中 162 条为无前缀写法（`千咲 | 丰汝肥屯（上下）by slap`、
  // `千咲 | 原版切换（x）by JR7`），仅 2 条「千咲皮肤[蜜桃冰]-…」保留全 title——那是上面一条管的。
  // ⚠️ 必须排在「千咲皮肤」之后，否则 `千咲皮肤[蜜桃冰]-…` 会被剥成 `皮肤[蜜桃冰]-…`。
  { prefix: "千咲", character: "千咲" },
  // 卡提希娅：库内 160 条中 157 条为无前缀写法（`卡提希娅 | 小卡-曲线优美`、
  // `卡提希娅 | 大卡-时韵 Mk3（；)og狩野樱`），仅 3 条保留前缀（加进本表前入库的遗留）。
  { prefix: "卡提希娅", character: "卡提希娅" },
  // 以下 4 个角色此前不在表内，会落到默认分支把「角色-」前缀原样留在 title 里
  // （如 `莫宁 | 莫宁-丰汝肥屯（上下左右）by mingchen`），与库内惯例不符：
  //   卜灵 22/22 无前缀、莫宁 99/100 无前缀、琳奈除「琳奈皮肤[薄荷糖]-」家族外均无前缀。
  // 补进来后统一剥离，title 只留皮肤名。
  // ⚠️ `琳奈` 必须排在 `琳奈皮肤` 之后，否则 `琳奈皮肤[薄荷糖]-…` 会被剥成
  //    `皮肤[薄荷糖]-…`，与库内 3 条既有写法冲突。
  { prefix: "琳奈", character: "琳奈" },
  { prefix: "莫宁", character: "莫宁" },
  { prefix: "卜灵", character: "卜灵" },
  { prefix: "景燃", character: "景燃" },
  // 绯雪：库内 26 条中 24 条为无前缀写法（`绯雪 | 心月狐 by kuzan`、`绯雪 | 原版切换（x）by JR7`），
  // 仅 2026-09-12 / 09-16 两条保留前缀——那是加进本表前入库的遗留。
  // 补进来后统一剥离，与主流写法对齐；dedupKey 会把已有前缀式记录归一化，不会重复入库。
  { prefix: "绯雪", character: "绯雪" },
];

/**
 * UI 类：整包 UI，title 保留完整 key
 *   - 任意「<角色>全ui…」（库内既有约定：`UI | 吟霖全ui-动态nsfw-v2.2.6`、`UI | 椿全ui-…`），
 *     含裸「全ui…」开头（`UI | 全ui背景-美图v3.5`）——故 `.*?` 允许零个前缀字符。
 *   - 「编队界面-…」「编队图片-…」（`UI | 编队界面-狐妻猫咪内衣-新增穗穗/清宵`）
 * 这里不写死角色清单——否则遇到清单外的角色（如「椿」）会落到默认分支，
 * 切出 `椿全ui` 这类站内不存在的假分类。
 */
const UI_FULL_KEY_RE = /^(?:.*?全ui|编队界面|编队图片)/;

/**
 * 武器皮：`<武器名>-<皮肤名>`，整包归 `武器`，title 保留完整 key。
 * 库内先例：`武器 | 千古-赛琳娜武器 by _eldarC`、`武器 | 停驻之烟-QBZ-97`。
 */
const WEAPON_PREFIXES = ["浩境粼光"];

/** 与 src/lib/mods-domain/sorting.ts 的 CHARACTER_ALIASES 保持一致（避免造出站内不存在的分类） */
const CHARACTER_ALIASES = {
  "陆赫斯": "路赫斯",
  "反虚化，ui界面，场景，葫芦，特效等": "UI",
  "千咲皮肤[蜜桃冰]": "千咲",
  "科考摩托": "滑翔翼,翱翔翼,科考摩托",
  // 库内「背包 编队 商城 用户界面-nsfw v2.5.2~2.5.5」4 条先例均归 UI
  "背包 编队 商城 用户界面": "UI",
  // 与「千咲皮肤[蜜桃冰]」同一规则：饰品名带后缀 → 归基础角色，title 保留完整 key
  "爱弥斯饰品[雪绒豹豹]": "爱弥斯",
};

/** 前缀 → UI 分类（如「索拉指南-长离动态nsfw」整包皮肤归 UI，title 去前缀） */
const UI_PREFIXES = ["索拉指南"];

/**
 * 「爱弥斯的机甲」「爱弥斯大招」整包 → 独立分类「爱弥斯的机甲」，**title 保留完整 key**。
 *
 * 该分类由用户于 2026-09-20 明确要求新建（突破 CLAUDE.md「不得新增 character 值」的默认约束）。
 * title 保留完整 key 的理由：upload-fifth.mjs 当年就是以 keepFull 方式把「爱弥斯的机甲-*」
 * 归到 爱弥斯 的，库内 3 条先例（丰汝肥屯 by slap / 赦罪者大卡v2 / 时韵大卡-守岸人光辉头v4）
 * 的 title 同样带前缀，沿用可保持一致。
 *
 * `爱弥斯大招` 单列一条：`爱弥斯大招的隧者-Aion by ZelbertYQ`（W-2026.9.20）若走默认分支，
 * 会被 `key.split(/[-－]/)[0]` 切成站内不存在的假分类「爱弥斯大招的隧者」。
 */
const AEMEATH_MECH_PREFIXES = ["爱弥斯的机甲", "爱弥斯大招"];

// ==================== 数据库连接 ====================

// 直连 Postgres(5432 pooler) 而不是 supabase-js：Supabase 出口配额超限时
// REST 网关一律回 402(exceed_egress_quota)，这条链路不受影响，且不烧出口流量。
// 与 backup-to-github.mjs 的兜底快照导出同源，实现见 scripts/psql-db.mjs。
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

// ==================== CSV 解析（夸克，含多行引号字段） ====================

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

// ==================== 分类解析 ====================

function normalizeCharacter(character) {
  return CHARACTER_ALIASES[character] ?? character;
}

/**
 * 去重键：`character|title`，但把 title 开头重复的「角色-」前缀归一化掉。
 *
 * 为什么需要：title 的前缀剥离规则会随 CHARACTER_PREFIX_MAP 增补而变。
 * 若某个角色事后才被加进表里，它早先入库的 `莫宁 | 莫宁-卡提希娅（上下）…`
 * 会与新解析出的 `莫宁 | 卡提希娅（上下）…` 不相等，全量运行时被当成新记录重复插入。
 * 两侧都过一遍这个函数，新旧写法即可互相匹配。
 * （库内 3 条先例：莫宁-卡提希娅 / 景燃-焚狱 / 景燃-猫咪）
 */
function dedupKey(character, title) {
  const c = String(character ?? "").trim();
  let t = String(title ?? "").trim();
  if (c && t.startsWith(c)) t = t.slice(c.length).replace(/^[-－\s]+/, "").trim();
  return `${c}|${t}`;
}

function resolveCharacterAndTitle(key) {
  // 特例：`尤诺的月环-XXX` → 尤诺，title 保留「的月环-XXX」
  // （库内 2026-08-10 批次共 7 条同格式先例；不能加裸前缀「尤诺」，
  //   否则会把 `尤诺-姓感内衣（下）…` 这类完整 key 的 title 切掉，导致重复入库）
  if (key.startsWith("尤诺的月环")) {
    return { character: "尤诺", title: key.slice("尤诺".length) };
  }
  // 独立分类：爱弥斯的机甲 / 爱弥斯大招 → 「爱弥斯的机甲」，title 保留完整 key
  for (const p of AEMEATH_MECH_PREFIXES) {
    if (key.startsWith(p)) {
      return { character: "爱弥斯的机甲", title: key };
    }
  }
  // UI 类：整包 UI（<角色>全ui / 编队界面 / 编队图片），title 保留完整 key
  if (UI_FULL_KEY_RE.test(key)) {
    return { character: "UI", title: key };
  }
  // UI 类：前缀直匹配（如索拉指南-长离动态nsfw），title 去前缀
  for (const p of UI_PREFIXES) {
    if (key.startsWith(p)) {
      const title = key.slice(p.length).replace(/^[-－\s]+/, "").trim() || key;
      return { character: "UI", title };
    }
  }
  // 武器皮：整包归 武器，title 保留完整 key
  for (const p of WEAPON_PREFIXES) {
    if (key.startsWith(p)) {
      return { character: "武器", title: key };
    }
  }
  // 角色类：前缀=角色，title 去前缀
  // 但「XX皮肤」类前缀（女漂皮肤/琳奈皮肤）保留完整 title——那是皮肤标题的一部分
  for (const { prefix, character } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title = key.slice(prefix.length).replace(/^[-－\s]+/, "").trim();
      // 「XX皮肤」类前缀，皮肤名是标题一部分 → 完整保留 title
      if (prefix.includes("皮肤")) title = key;
      if (!title) title = key;
      return { character: normalizeCharacter(character), title };
    }
  }
  return { character: normalizeCharacter(key.split(/[-－]/)[0] || key), title: key };
}

// ==================== 图片索引（目录顶层 + 预览图 子目录，png 优先） ====================

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const PREFERRED_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// 图片名可能带尾随 UUID（如「...by SlugCat-31f20660-f72c-485c-8616-444bff91d79c.png」），
// 索引 key 去掉该段，使其与 exe 的 base 精确对应，从而匹配到预览图；读取仍用真实路径。
const UUID_SUFFIX_RE = /-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function indexFilesInto(byBase, dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = basename(e.name, ext);
    const indexKey = base.replace(UUID_SUFFIX_RE, "");
    if (!byBase.has(indexKey)) byBase.set(indexKey, []);
    // 记录文件所在目录，避免子目录图片被拼到顶层路径
    byBase.get(indexKey).push({ file: join(dir, e.name), ext });
  }
}

function buildImageIndex(dir) {
  const byBase = new Map();
  // 先扫顶层，再扫「预览图」子目录（子目录可能被顶层同名覆盖，需顶层优先）
  indexFilesInto(byBase, dir);
  indexFilesInto(byBase, join(dir, "预览图"));
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
  const origSize = (fileBuffer.length / 1024).toFixed(1);
  const webpBuffer = await sharp(fileBuffer)
    .resize({ width: 750, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const webpSize = (webpBuffer.length / 1024).toFixed(1);
  const reduction = (((fileBuffer.length - webpBuffer.length) / fileBuffer.length) * 100).toFixed(0);
  return { buffer: webpBuffer, origSizeKB: parseFloat(origSize), webpSizeKB: parseFloat(webpSize), reduction };
}

// ==================== 日期目录解析 ====================

// "W-2026.9.4" → { y:2026, m:9, d:4 }；返回 null 表示不是日期目录
const DATE_DIR_RE = /^W-(\d{4})\.(\d{1,2})\.(\d{1,2})$/;

function parseDateDir(name) {
  const m = DATE_DIR_RE.exec(name);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// 生成该日期"上海中午"的 ISO 时间戳，保证 DailyUpdate 按该日期归组
function noonShanghaiISO({ y, m, d }) {
  // 上海 = UTC+8，中午12:00 → UTC 04:00
  const padded = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return `${padded}T04:00:00.000Z`;
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
 * 把一批记录编成一条 insert 语句。
 *
 * 用 jsonb_populate_recordset(null::mods, ...) 让 Postgres 按 mods 的真实列类型
 * 自己解析 JSON —— text[]、jsonb、timestamptz、boolean 都不必在这里手写转义，
 * 也就不怕标题里的引号 / 反斜杠 / 换行把 SQL 拼坏。
 *
 * where not exists 是第二道去重：上游已用 existingSet 跳过重复，这里再兜一次，
 * 防止脚本重跑或两次运行撞车时插出双份。
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
  if (isDryRun) console.log("🔍 DRY-RUN 模式：解析 + 匹配 + 转 WebP，不实际上传/入库。\n");

  // 1. 发现日期子目录（按日期升序处理，输出更符合直觉）
  let dirEntries = readdirSync(BASE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
    .map((e) => ({ name: e.name, date: parseDateDir(e.name) }))
    .sort((a, b) => {
      const ka = a.date.y * 10000 + a.date.m * 100 + a.date.d;
      const kb = b.date.y * 10000 + b.date.m * 100 + b.date.d;
      return ka - kb;
    });

  if (filterDates) {
    const before = dirEntries.length;
    dirEntries = dirEntries.filter((d) => filterDates.has(`${d.date.y}.${d.date.m}.${d.date.d}`));
    console.log(
      `🎯 --dates 过滤: ${before} 个目录 → ${dirEntries.length} 个 (${[...filterDates].join(", ")})`
    );
  }

  if (dirEntries.length === 0) {
    console.error("❌ 未发现任何 W-YYYY.M.D 日期子目录（或都被 --dates 过滤掉了）");
    process.exit(1);
  }
  console.log(`📁 待处理 ${dirEntries.length} 个日期子目录: ${dirEntries.map((d) => d.name).join(", ")}\n`);

  // 2. 查询现有记录用于去重（character|title）
  //
  // 一次查询拿全量、在 SQL 里聚成 JSON，而不是原来的分页 1000 条翻页：
  // 这一步发生在传图之前，任何一次失败都会让整批 mod 连图片都传不上去。
  const existing = await psqlJson(`
select coalesce(
  json_agg(json_build_object('title', title, 'character', character)),
  '[]'::json
)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)};
`);

  if (!Array.isArray(existing)) {
    console.error("❌ 查询现有记录失败：psql 未返回数组");
    process.exit(1);
  }
  const existingSet = new Set(existing.map((m) => dedupKey(m.character, m.title)));
  console.log(`🗄  现有 mod 记录: ${existing.length}\n`);

  // 3. 逐目录处理
  const results = [];
  const placeholderKeys = [];
  const skipDupKeys = [];
  const charCount = {};
  let matchedImage = 0;
  let placeholder = 0;
  let skipDup = 0;

  for (const dir of dirEntries) {
    const dirPath = join(BASE, dir.name);
    const created_at = noonShanghaiISO(dir.date);
    const dateLabel = `${dir.date.y}-${dir.date.m}-${dir.date.d}`;
    console.log(`===== ${dir.name} (created_at=${created_at}) =====`);

    // 3a. 解析该目录内 CSV
    const csvs = readdirSync(dirPath).filter((fn) => fn.endsWith(".csv"));
    if (csvs.length === 0) {
      console.log(`   ⚠️ 无 CSV，跳过`);
      continue;
    }
    const records = [];
    for (const f of csvs) records.push(...parseQuarkCsv(join(dirPath, f)));

    // 3b. 目录内去重 + 剔除
    const unique = [];
    const seen = new Set();
    for (const r of records) {
      const k = r.key + "|" + r.url;
      if (seen.has(k)) continue;
      seen.add(k);
      if (SKIP_PREFIXES.some((p) => r.key.startsWith(p))) continue;
      unique.push(r);
    }
    console.log(`   解析 ${records.length} 条，去重后 ${unique.length} 条`);

    // 3c. 该目录图片索引
    const imageMap = buildImageIndex(dirPath);
    console.log(`   预览图索引: ${imageMap.size} 个唯一 base`);

    // 3d. 逐条处理
    for (const record of unique) {
      const { character, title } = resolveCharacterAndTitle(record.key);
      if (existingSet.has(dedupKey(character, title))) {
        skipDup++;
        skipDupKeys.push(`${dateLabel} · ${character} | ${title}`);
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
        placeholderKeys.push(`${dateLabel} · ${character} | ${title}`);
      } else {
        matchedImage++;
        try {
          const { buffer, origSizeKB, webpSizeKB, reduction } = await convertToWebP(imagePath);
          const objectKey = `mods/${slugify(character)}/${modId}/preview.webp`;
          if (isDryRun) {
            imageUrl = buildCosUrl(objectKey);
            console.log(`   🖼  ${dateLabel} ${character} | ${title}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`);
          } else {
            await uploadToCos(objectKey, buffer, "image/webp");
            imageUrl = buildCosUrl(objectKey);
            console.log(`   ✅ ${dateLabel} ${character} | ${title}`);
          }
        } catch (err) {
          console.error(`   ❌ ${record.key}: ${err.message}`);
          imageUrl = PLACEHOLDER_IMAGE_URL;
          placeholder++;
          placeholderKeys.push(`${dateLabel} · ${character} | ${title}`);
        }
      }

      if (!charCount[character]) charCount[character] = 0;
      charCount[character]++;

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
        created_at, // 显式设置：归属该日期，保证每日更新页按日期分组
      });
    }
    console.log("");
  }

  console.log(`\n✅ 匹配预览图: ${matchedImage}，占位图: ${placeholder}，去重跳过: ${skipDup}`);

  if (skipDupKeys.length) {
    console.log("\n⏭️  已存在跳过:");
    skipDupKeys.forEach((k) => console.log(`   - ${k}`));
  }

  console.log(`\n=== 按分类汇总 (待上传 ${results.length} 条) ===`);
  const charRows = Object.entries(charCount).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of charRows) console.log(`   ${c.padEnd(20)} ${n}`);

  // 按日期汇总
  const byDate = {};
  for (const r of results) {
    const dt = r.created_at.slice(0, 10);
    byDate[dt] = (byDate[dt] || 0) + 1;
  }
  console.log("\n=== 按日期汇总 ===");
  for (const [dt, n] of Object.entries(byDate).sort()) console.log(`   ${dt}  ${n} 条`);

  if (placeholderKeys.length) {
    console.log("\n⚠️  以下记录使用占位图（未匹配到预览图）:");
    placeholderKeys.forEach((k) => console.log(`   - ${k}`));
  }

  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN: 跳过入库，共 ${results.length} 条记录`);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱ 耗时 ${elapsed}s`);
    return;
  }

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
      continue;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n📊 完成: 成功 ${inserted} 条, 失败 ${failed} 条 (耗时 ${elapsed} 分钟)`);

  // 有新数据才通知。全部被去重跳过时缓存里本来就没变化，不必白敲一次。
  // 失败不影响脚本退出码：数据已经入库了，最坏是等一个 TTL 自然到期。
  if (inserted > 0) {
    await notifyRevalidate();
  }
}

/**
 * 通知线上清掉公开读缓存，让刚入库的 mod 立刻出现在前台。
 *
 * 为什么必须调：本脚本用 psql 直连 Postgres 写库，完全绕开 Next 运行时，
 * 前台的 unstable_cache 不会自己失效。而缓存 TTL 为压出口配额已涨到 6 小时，
 * 不通知的话上午上传的批次可能到晚上才可见。
 *
 * 密钥 REVALIDATE_SECRET 必须与 Vercel 上的同名环境变量一致（本地读 .env.local）。
 * 只告警不抛错 —— 缓存没刷成不该让一次成功的上传看起来像失败了。
 */
async function notifyRevalidate() {
  const secret = process.env.REVALIDATE_SECRET?.trim();

  if (!secret) {
    console.warn("⚠️  未配置 REVALIDATE_SECRET，跳过缓存失效通知");
    console.warn("   新 mod 最多要等 6 小时（TTL）才出现在前台。");
    return;
  }

  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
    });

    if (res.ok) {
      console.log("🔔 已通知前台刷新缓存，新 mod 立即可见");
      return;
    }

    // 把响应体截断打印：接口错误时会带上原因，但别把整页 HTML 刷进终端
    const body = (await res.text()).slice(0, 200);
    console.warn(`⚠️  缓存失效通知被拒: HTTP ${res.status} ${body}`);
    if (res.status === 401 || res.status === 503) {
      console.warn("   本地 .env.local 的 REVALIDATE_SECRET 与 Vercel 环境变量必须一致。");
    }
  } catch (err) {
    console.warn(`⚠️  缓存失效通知失败: ${err.message}`);
    console.warn("   数据已入库，只是前台要等 TTL 到期才刷新。");
  }
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
