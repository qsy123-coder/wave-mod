/**
 * 上传「A_每日更新」按日期子目录批次 Mod：各网盘导出 + 预览图 → 腾讯云 COS + Supabase。
 *
 * 与 upload-a-daily.mjs 的区别：
 *   1. 数据组织为日期子目录 W-YYYY.M.D（每目录一个 CSV + exe + 预览图；
 *      预览图在顶层或「预览图」子目录）。
 *      **多图**：同一 mod 的额外图命名为 `<主图 base>-1.png` / `-2.png` …，
 *      一起入库到 images[] —— 主图（无编号的那张）是 images[0]（站内首图/封面），
 *      编号图按数字升序排后面。COS 键：preview.webp / preview-2.webp / preview-3.webp …
 *   2. 每条记录显式设置 created_at = 该目录日期中午(上海时区)，保证每日更新页
 *      按 9.4 / 9.5 / 9.6 分组，而不会全部落到"今天"。
 *      **库内已存在的记录同样会重新上架**（用户 2026-10-30 要求：「不管库里有没有，
 *      每次上传都要在每日更新里显示」）：去重命中时不新增行，只把那一行的 created_at
 *      推到本目录日期（只往前推）。去重键 `character|title` 不受影响。
 *   3. **一键吃下当天所有网盘**：目录里有什么盘就写什么盘，不再分两个脚本跑。
 *      · `分享结果导出-*.csv`  → 夸克（parseQuarkCsv，主盘，恒有）
 *      · `分享结果导出-*.xlsx` → 迅雷（loadXunleiIndex）
 *      此前迅雷要靠 apply-daily-xunlei-by-date.mjs 补第二遍，漏跑一次就整批没有
 *      （2026-09-22 即如此），所以并进来：两边都按 exe 文件名直接 join，
 *      不需要按 (character, title) 反解，也就绕开了「前缀表两处维护」那个坑。
 *      若某天仍有记录在入库后才发现迅雷链接（比如重跑），收尾会列出清单并指路。
 *
 * 用法:
 *   node scripts/upload-daily-by-date.mjs --dry-run   # 只解析 + 匹配 + 转 WebP，不上传不入库
 *   node scripts/upload-daily-by-date.mjs              # 正式上传
 *   node scripts/upload-daily-by-date.mjs --dates=2026.9.11,2026.9.12
 *                                                      # 只处理指定日期目录（其余目录跳过）
 *   node scripts/upload-daily-by-date.mjs --dates=2026.11.11 --refresh-images
 *                                                      # 只给已有行补/换封面（占位图 → 本地图），
 *                                                      # 不改标题/链接，用于首次上传时图片还没放到位的修复
 */

import { readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

import { syncCoverSizes } from "./cover-size.mjs";
import { resolveDakaIfApplicable } from "./daka-classify.mjs";
import { resolveReshareAlias } from "./reshare-title-aliases.mjs";
import { parseXunleiTxt, withXunleiPwd } from "./xunlei-txt-parse.mjs";
import { parseQuarkCsvText } from "./quark-csv-parse.mjs";
import {
  dedupKey,
  extractVersion,
  resolveCanonicalKey,
  resolveCharacterAndTitle,
  stripRenameSuffix,
} from "./daily-classify.mjs";
import { looseImageKey } from "./image-name-match.mjs";
import { SNAPSHOT_REL_PATH, notifyRevalidate, publishSnapshotToCos } from "./mods-snapshot-export.mjs";
import { readModGroupsFile } from "./mod-groups.mjs";
import { matchRecordsToGroups, normalizeGroupKey } from "./mod-groups-pure.mjs";
import { buildImageUpdateSql, buildInsertSql, buildMergeDriveLinksSql, buildRedateSql, buildUnpublishSql } from "./mod-upload-sql.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
/** 只刷新已有行的预览图（占位图 → 本地图），不改标题/链接 */
const refreshImages = args.includes("--refresh-images");

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

// 数据盘位置随机器不同（旧机 D:，2026-10-29 重装系统后为 F:），用环境变量覆盖默认值。
const BASE =
  process.env.WAVE_MOD_DAILY_BASE?.trim() ||
  String.raw`F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;

const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const GAME_KEY = "wuthering-waves";
const GAME_VERSION = "未标注";
const DEFAULT_VERSION = "未标注";

/** 站点地址：默认线上域名；本地调试可设 WAVE_MOD_SITE_URL=http://localhost:3000 */
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";

const XXMI_GUIDE = [
  "1. 下载并解压对应 MOD 压缩包。",
  "2. 打开 XXMI Launcher，确认当前游戏版本与 MOD 版本匹配。",
  "3. 将 MOD 文件夹复制到 XXMI Mods 目录。",
  "4. 返回启动器启用对应角色模组后进入游戏检查效果。",
].join("\n");

const SKIP_PREFIXES = [];


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

// 预览图缓存策略。**必须与 src/lib/cos/shared.ts 的 COS_IMAGE_CACHE_CONTROL 保持一致**
// （脚本不能 import TS，只能复制）。改一边就要改两边。
// 不用 immutable：键无内容哈希、换图原地覆盖，永久缓存会让换掉的图刷不出来。
const IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";

function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        CacheControl: IMAGE_CACHE_CONTROL,
      },
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
  return parseQuarkCsvText(readFileSync(filePath, "utf-8"));
}


// ==================== 迅雷分享导出（同一日期目录里的 .xlsx） ====================


/**
 * 扫描 BASE 下各日期目录里的迅雷分享导出（`分享结果导出-*.xlsx`），
 * 返回 Map<日期目录名, { index: Map<去 .exe 的分享名, { link, pwd }>, exported: number, files: Set }>。
 * `exported` 是该目录导出的**文件数**（按去掉 `(N)` 重名后缀归一后去重）：
 * index 里因为别名而比它多，覆盖表要拿它当分母，否则别名会让「导出条数」虚高、误报漏盘；
 * 同一个文件被分享两次（`xx` 与 `xx(1)`）也只算一个，否则分母同样虚高、天天误报。
 *
 * 为什么调 scripts/parse-daily-xunlei-xlsx.ps1 而不是在 Node 里解 xlsx：
 * 项目没声明任何 zip 依赖（`jszip` 实际已解析不到，scripts/parse-daily-xunlei.mjs
 * 目前跑不起来；`fast-xml-parser` 只是传递依赖），而 CLAUDE.md 禁止引入未声明的库。
 * 该 ps1 是 ASCII-only 源码 + 路径走参数，正是为了躲开 5.1 的 ANSI 代码页坑，
 * 且已被 9 天批次验证过。
 *
 * 失败一律降级成「今天没有迅雷链接」而不是抛错：迅雷是附加盘，解析不了不该
 * 把当天整批 mod（连带夸克链接和预览图）一起卡死。
 */
function loadXunleiIndex() {
  const outPath = join(tmpdir(), `wavemod-xunlei-${randomUUID()}.json`);
  const ps1 = resolve(process.cwd(), "scripts/parse-daily-xunlei-xlsx.ps1");
  try {
    const res = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Root", BASE, "-OutJson", outPath],
      { encoding: "utf8" }
    );
    if (res.status !== 0) {
      console.warn(`⚠️  迅雷导出解析失败（退出码 ${res.status}），本次只写夸克链接`);
      const detail = res.stderr?.trim() || res.stdout?.trim();
      if (detail) console.warn(`   ${detail.split(/\r?\n/).slice(0, 3).join(" | ")}`);
      return new Map();
    }

    const rows = JSON.parse(readFileSync(outPath, "utf8"));
    const byDay = new Map();
    for (const r of rows) {
      const link = String(r.link ?? "").trim();
      if (!link.startsWith("http")) continue; // 表头行
      const key = String(r.name ?? "").replace(/\.exe$/i, "").trim();
      if (!key) continue;
      if (!byDay.has(r.day)) byDay.set(r.day, { index: new Map(), exported: 0, files: new Set() });
      const day = byDay.get(r.day);
      // `files` 按「去掉重名后缀的名字」去重：同一个文件分享两次（`xx` 与 `xx(1)`）
      // 在覆盖表里只该算一个文件，否则分母虚高、天天误报漏盘。
      // `exported` 与 `files.size` 同时+1，保持下游只看 `exported` 的口径。
      const norm = stripRenameSuffix(key);
      if (!day.files.has(norm)) {
        day.files.add(norm);
        day.exported++;
      }
      const entry = { link, pwd: r.pwd || "" };
      // 同一天同名只可能是重复导出，后写入的覆盖前者即可
      day.index.set(key, entry);
      // 迅雷侧带重名后缀时（`丽贝卡-洁薇塔（90）by woju(1)`），CSV 侧的本名是干净的，
      // 反向查不到 —— 所以额外用「去过后缀的名字」也登记一份。
      // 只在那个槽位还空着时登记：真有两个不同文件恰好剥出同名（`xx(1)` 与 `xx(2)`），
      // 那属于歧义，宁可让它们查不到也不要随便顶上一条错的链接。
      const stripped = stripRenameSuffix(key);
      if (stripped !== key && !day.index.has(stripped)) day.index.set(stripped, entry);
    }
    return loadXunleiTxtIndex(byDay);
  } catch (err) {
    console.warn(`⚠️  迅雷导出解析异常：${err.message}，本次只写夸克链接`);
    return new Map();
  } finally {
    rmSync(outPath, { force: true });
  }
}

/**
 * 迅雷分享导出有时不是 xlsx，而是手动抄下来的 txt（2026-10-29 那批就是）：
 *   `分享文件：xxx.exe` / `链接：https://pan.xunlei.com/s/...` / `提取码：abcd`
 * 只认 xlsx 会让整批迅雷**静默漏掉**（CLAUDE.md 点名过的事故），所以在 txt 里补一遍。
 *
 * 合并规则：txt 只填空位，不覆盖 xlsx —— 导出表才是正式来源，txt 是手抄备份；
 * 两边都有同名时保留 xlsx 的那条。`exported` 只统计该文件不在 `files` 里的条目
 * （同一文件在 txt 里出现两次只算一个）。
 */
function loadXunleiTxtIndex(byDay) {
  let dayNames;
  try { dayNames = readdirSync(BASE); } catch { return byDay; }
  for (const dayName of dayNames) {
    if (!/^W-\d{4}\.\d{1,2}\.\d{1,2}$/.test(dayName)) continue;
    const dir = join(BASE, dayName);
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    for (const file of files.filter((f) => /\.txt$/i.test(f))) {
      let text;
      try { text = readFileSync(join(dir, file), "utf8"); } catch { continue; }
      for (const { name, link, pwd } of parseXunleiTxt(text)) {
        if (!byDay.has(dayName)) byDay.set(dayName, { index: new Map(), exported: 0, files: new Set() });
        const day = byDay.get(dayName);
        const entry = { link, pwd };
        const norm = stripRenameSuffix(name);
        // 与 xlsx 侧同口径：`files` 去重，同一文件重复分享不计两条导出
        if (!day.files.has(norm)) {
          day.files.add(norm);
          day.exported++;
        }
        // 只填空位，不覆盖 xlsx 的正式导出
        if (!day.index.has(name)) day.index.set(name, entry);
        // 手抄 txt 同样带迅雷的 `(1)` 重名后缀（2026-10-31：本名共享 + 重名共享两条，
        // 只登记原样名会让 5 条链接静默丢失）。与 xlsx 侧同一套别名规则。
        if (norm !== name && !day.index.has(norm)) day.index.set(norm, entry);
      }
    }
  }
  return byDay;
}

/** 按 exe 文件名取迅雷链接；精确匹配落空再退一步去掉重名后缀 */
function lookupXunlei(dayIndex, key) {
  if (!dayIndex) return null;
  return dayIndex.get(key) || dayIndex.get(stripRenameSuffix(key)) || null;
}

// ==================== 分类解析 ====================

/**
 * 全角/半角括号折叠：「心(含大招)」「心（含大招）」「心(含大招）」是同一个前缀。
 * 与 src/lib/mods-domain/sorting.ts 的同名函数保持一致。
 */



// ==================== 图片索引（目录顶层 + 预览图 子目录，png 优先） ====================

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const PREFERRED_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// 图片名可能带尾随 UUID（如「...by SlugCat-31f20660-f72c-485c-8616-444bff91d79c.png」），
// 索引 key 去掉该段，使其与 exe 的 base 精确对应，从而匹配到预览图；读取仍用真实路径。
const UUID_SUFFIX_RE = /-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * 图片 base 与 exe base 对不上、且尾侧重名后缀也解释不了的特例。
 *
 * 键 = 图片 base，值 = CSV（exe）侧的 base。
 * 2026-09-27「清宵-盛世云岚」：图片 `…v1.1(1)by辉映星辰允如光` vs exe `…v1.1(0)by…`，
 * 只差版本位一个数字，同目录只有这一对，看图确认是同一套 mod（用户已确认）。
 *
 * 不写成通 regex 而逐条登记的理由：中段括号项目里一直刻意不碰 —— 见 stripRenameSuffix
 * 的注释，把 `(N)` 当通则会把 `小卡-校园JK2.0（内附切换）` 这类真名字也削掉。
 */
const IMAGE_KEY_ALIASES = new Map([
  ["清宵-盛世云岚v1.1(1)by辉映星辰允如光", "清宵-盛世云岚v1.1(0)by辉映星辰允如光"],
]);

/**
 * 预览图覆盖：**不传本地图**，首图直接复用站内已有 mod 的图片 URL。
 *
 * 键 = 规范名（canonicalKey），值 = 要复用的 COS 图片 URL。
 * 2026-10-29 用户要求：`心(含大招)-胧嫣2.0（内附切换）` 复用站内 2026-10-18 那条
 * `心(含大招)-胧嫣（【】）`（同为心月狐）的封面 —— 本地那张只有 585×1303，旧封面
 * 1000×750 更清楚。只在首次入库时生效：之后同 key 重跑会被去重跳过，不会再读这里。
 */
const IMAGE_URL_OVERRIDES = new Map([
  [
    "心(含大招)-胧嫣2.0（内附切换）",
    "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/心月狐/051efd2a-a8ae-4486-ba93-5089a04b70bb/preview-hd.webp",
  ],
]);

function indexFilesInto(byBase, dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = basename(e.name, ext);
    // 登记多个 key：去尾随 UUID 的（原有规则）+ 再叠一层「去重名后缀」的别名。
    // 与迅雷侧 loadXunleiIndex 同构 —— 索引侧两种写法都登记，查询侧才敢先精确、再退化。
    // 为什么图片也要这一层：图片名常带 ` (2)`（Windows/浏览器重复下载的改名），
    // 例 2026-09-27「弗洛洛-校园服饰v3.6（9） (2).png」对不上干净的 exe 名。
    const trimmed = base.replace(UUID_SUFFIX_RE, "");
    const entry = { file: join(dir, e.name), ext };
    const keys = new Set([trimmed, stripRenameSuffix(trimmed)]);
    const alias = IMAGE_KEY_ALIASES.get(trimmed);
    if (alias) keys.add(alias);
    for (const indexKey of keys) {
      if (!byBase.has(indexKey)) byBase.set(indexKey, []);
      // 记录文件所在目录，避免子目录图片被拼到顶层路径
      byBase.get(indexKey).push(entry);
    }
  }
}

/**
 * 多图预览的后缀：主图 base 之后接 `-1` / `_1`（1 起），如
 * `锁暝-黑白双色裙（…）-1.png`。**只认纯数字后缀** —— 中段括号、`v1.2` 这类是
 * 标题的一部分（见 IMAGE_KEY_ALIASES 的注），当通则会把真名字削掉。
 */
const GALLERY_SUFFIX_RE = /^[-_](\d{1,3})$/;

function buildImageIndex(dir) {
  const byBase = new Map();
  // 先扫顶层，再扫「预览图」子目录（子目录可能被顶层同名覆盖，需顶层优先）
  indexFilesInto(byBase, dir);
  indexFilesInto(byBase, join(dir, "预览图"));
  // 爬虫把附件预览图放在来源子目录（GameBanana/arca.live），只扫顶层会一律落到占位图。
  // 放在最后扫：同 base 时顶层/预览图的条目排在前面，保持「顶层优先」。
  for (const source of ["GameBanana", "arca.live"]) {
    indexFilesInto(byBase, join(dir, source));
  }
  // 用户临时把改名好的包放进「新建文件夹」等暂存目录时，预览图也在那一层。
  // 只扫一级（不递归进包内），且放在最后，保证正式目录的同名图优先。
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (["预览图", "GameBanana", "arca.live"].includes(entry.name)) continue;
    indexFilesInto(byBase, join(dir, entry.name));
  }
  const primary = new Map();
  for (const [base, list] of byBase) {
    list.sort((a, b) => PREFERRED_EXTS.indexOf(a.ext) - PREFERRED_EXTS.indexOf(b.ext));
    primary.set(base, list[0]);
  }
  return { primary, byBase };
}

/**
 * 精确名找不到时的兜底：按「去版本后缀、去作者」的宽松键再找一组图。
 *
 * 命名工坊把同一 GameBanana 帖子的第 2 个附件连同预览图改名成
 * `角色-名称（Free） by 作者` / `角色-名称-2 by 作者`，而分享导出仍是基础名，
 * 精确匹配会全部落空（2026-11-12 的 W-2026.11.12 就是这样）。
 * 只在前面的精确匹配失败后才走这里。
 */
function looseImages(byBase, key) {
  const target = looseImageKey(key);
  if (!target) return [];

  const orderOf = (base) => {
    const m = /[-_](\d{1,3})$/.exec(base);
    return m ? Number(m[1]) : 0;
  };

  const seen = new Set();
  const found = [];
  for (const [base, list] of byBase) {
    if (looseImageKey(base) !== target) continue;
    for (const entry of list) {
      if (seen.has(entry.file)) continue;
      seen.add(entry.file);
      found.push({ entry, order: orderOf(base) });
    }
  }
  found.sort(
    (a, b) =>
      a.order - b.order ||
      PREFERRED_EXTS.indexOf(a.entry.ext) - PREFERRED_EXTS.indexOf(b.entry.ext),
  );
  return found.map(({ entry }) => entry);
}

/**
 * 取某个 mod 的全部预览图，**首图在前**。
 *
 * 顺序规则（用户 2026-10-22 定的）：主图（不带编号后缀的那张）是首图，也是站内
 * images[0]（列表封面）；`-1` / `-2` … 按数字升序排在后面。只有编号图、没有主图时，
 * 就从 `-1` 起按序当预览图（`-1` 成为首图），不再退化成占位图。
 *
 * 返回 [{ file, ext }]，无图时返回 []。
 */
function lookupImages({ primary, byBase }, key) {
  const stripped = stripRenameSuffix(key);
  const mainBase = primary.has(key) ? key : primary.has(stripped) ? stripped : null;
  if (!mainBase) {
    // 没有主图：看有没有 <key>-1 / <key>_1 这一组
    const hasNumbered = [`${key}-1`, `${stripped}-1`, `${key}_1`, `${stripped}_1`].some((k) => primary.has(k));
    if (!hasNumbered) return looseImages(byBase, key);
  }
  const base = mainBase ?? (primary.has(`${key}-1`) ? key : stripped);

  const out = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry || seen.has(entry.file)) return;
    seen.add(entry.file);
    out.push(entry);
  };

  push(primary.get(base));

  // 编号图：base + `-N` / `_N`。按 N 升序，同 N 再按扩展名优先级
  const numbered = [];
  for (const [candidate, entry] of primary) {
    if (candidate === base || !candidate.startsWith(base)) continue;
    const m = GALLERY_SUFFIX_RE.exec(candidate.slice(base.length));
    if (m) numbered.push({ order: Number(m[1]), entry });
  }
  numbered.sort((a, b) => a.order - b.order || PREFERRED_EXTS.indexOf(a.entry.ext) - PREFERRED_EXTS.indexOf(b.entry.ext));
  // 去重名后缀的别名也会进 primary（如 `x-1 (2)`），按 file 去重避免同一张传两遍
  for (const { entry } of numbered) push(entry);

  return out;
}

// ==================== 图片转换 ====================

/**
 * 预览图入库规格：1000px 宽。
 *
 * 2026-10-22 之前是 750，更早的存量是 560。卡片位真正吃像素的是**瀑布流里横跨
 * 两列的横屏卡**：手机约 355 CSS px、桌面 5 列约 490 CSS px，2x 屏分别要 ~710 / ~980
 * 设备像素 —— 560 被放大 1.3–1.8 倍，750 在桌面大卡上仍然不够（用户 2026-10-22 反馈
 * 「卡片还是太糊」）。渲染层 `imageMogr2/thumbnail/Nx%3E` 只缩不放，图源多高就是天花板，
 * 所以这里直接按 1000 存（单张实测 60–90KB，仍在手机首屏 ≤1.2MB 的预算内）。
 */
const PREVIEW_WIDTH = 1000;

async function convertToWebP(imagePath) {
  const fileBuffer = readFileSync(imagePath);
  const origSize = (fileBuffer.length / 1024).toFixed(1);
  const webpBuffer = await sharp(fileBuffer)
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
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

/** 日期目录 → 定长 `YYYY-MM-DD`，用于字符串比较（`2026-10-9` 与 `2026-10-10` 不能直接比） */
function paddedDayKey({ y, m, d }) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 库内 `created_at` → 上海日历日 `YYYY-MM-DD`。
 * 与 `src/lib/mods-domain/daily.ts` 的 `toDateKey` 同一口径：每日更新按上海日期分组，
 * 所以这里也必须用 +08 换算后的日期来比较，否则 00:00–08:00 入库的记录会差一天。
 */
function shanghaiDayKey(iso) {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  return new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
}

// ==================== 入库 SQL 生成 ====================
// 构造器在 scripts/mod-upload-sql.mjs —— 单独拆出去后 vitest 才能测，
// 本文件在模块加载阶段就要求 DATABASE_URL / COS 环境变量。

function isPlaceholderImage(url) {
  return !url || /placeholder/i.test(String(url));
}

/**
 * 合并组的链接去重：同一变体同一网盘只留一条。
 *
 * CSV 里偶尔会有同一个包的两行分享（不同 URL），如果都保留，前台会出现两个
 * 一模一样的「夸克」按钮。保留第一条并打日志，避免静默丢链接。
 */
function dedupeGroupLinks(links) {
  const slots = new Set();
  const seen = new Set();
  const out = [];
  for (const link of links) {
    const key = `${link.variant ?? ""}|${link.platform}|${link.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const slot = `${link.variant ?? ""}|${link.platform}`;
    if (slots.has(slot)) {
      console.warn(`   ⚠️ 变体「${link.variant ?? "默认"}」有多个${link.platform}分享，保留第一条`);
      continue;
    }
    slots.add(slot);
    out.push(link);
  }
  return out;
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
  // xunlei 布尔列是为了收尾那声「已存在的记录拿到了迅雷链接」的提醒：不查这一列
  // 的话，重跑时会把**已经补过**迅雷的记录也全列一遍，提醒立刻变成噪音。
  // 用 jsonb 包含判断只回一个布尔，比把整列 drive_links 拉回来轻得多。
  const existing = await psqlJson(`
select coalesce(
  json_agg(json_build_object(
    'id', id,
    'title', title,
    'character', character,
    'created_at', created_at,
    'images', images,
    'is_published', is_published,
    'xunlei', coalesce(drive_links @> '[{"platform":"迅雷网盘"}]'::jsonb, false)
  )),
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
  // 去重键 → 库内那一行。命中时要把它的 created_at 推到本目录日期（重新上架），
  // 需要 id 才能定位；顺带拿到原 created_at 判断「是否已经在更晚的日期上」。
  const existingByKey = new Map(existing.map((m) => [dedupKey(m.character, m.title), m]));
  // 库内已经有迅雷链接的记录，用来过滤下面的回填提醒（只提醒真缺的那些）
  const existingHasXunlei = new Set(
    existing.filter((m) => m.xunlei).map((m) => dedupKey(m.character, m.title))
  );
  console.log(`🗄  现有 mod 记录: ${existing.length}\n`);

  // 2b. 迅雷分享导出（同日目录的 .xlsx）。解析失败时是空 Map，逐条只写夸克链接。
  const xunleiIndex = loadXunleiIndex();
  const xunleiTotal = [...xunleiIndex.values()].reduce((n, d) => n + d.exported, 0);
  console.log(`⚡ 迅雷导出索引: ${xunleiIndex.size} 个日期目录 / ${xunleiTotal} 条\n`);

  // 3. 逐目录处理
  const results = [];
  const placeholderKeys = [];
  const skipDupKeys = [];
  // 库内已存在、但要「重新上架」到本目录日期的行（只推 created_at，不新增记录）
  const redated = [];
  // 合并记录命中库内基础行时，链接要和旧行求并集（新变体/新链接补进去）
  const mergedUpdates = [];
  // --refresh-images：已有行的封面还是占位图时，用本次目录里的本地图补上
  const imageUpdates = [];
  let refreshedImages = 0;
  let mergedGroups = 0;
  let mergedVariants = 0;
  let skippedLegacyGroups = 0;
  // 自动合并当天被逐条插出来的变体行：合并成功后把这些重复行下架
  let autoHealGroups = 0;
  const autoUnpublishIds = [];
  const charCount = {};
  let matchedImage = 0;
  let placeholder = 0;
  let skipDup = 0;
  let xunleiAttached = 0;
  // 多图预览（主图之外的额外图）：条数与张数分开计数，便于验收
  let multiImageMods = 0;
  let extraImageCount = 0;
  // 每天 { 夸克条数, 迅雷条数, 迅雷导出条数 }，收尾时用来一眼看出哪天漏了盘
  const driveCoverage = {};
  // 已存在记录拿到的迅雷链接：本轮不写库（走的是 dedup 跳过分支），但必须让人知道
  const xunleiBacklog = [];

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
    const imageIndex = buildImageIndex(dirPath);
    console.log(`   预览图索引: ${imageIndex.primary.size} 个唯一 base`);

    /**
     * `--refresh-images`：按 canonicalKey 重新找图，覆盖该行自己的 COS 前缀。
     * 用于首次上传时预览图还没放到顶层/来源目录、导致落了占位图的情况。
     */
    const refreshRowImages = async (canonicalKey, rowId, character) => {
      const overrideUrl = IMAGE_URL_OVERRIDES.get(canonicalKey);
      const entries = overrideUrl ? [] : lookupImages(imageIndex, canonicalKey);
      if (!overrideUrl && entries.length === 0) return null;
      const urls = [];
      if (overrideUrl) {
        urls.push(overrideUrl);
      } else {
        const slug = slugify(character);
        for (const [idx, entry] of entries.entries()) {
          const name = idx === 0 ? "preview" : `preview-${idx + 1}`;
          const { buffer } = await convertToWebP(entry.file);
          const objectKey = `mods/${slug}/${rowId}/${name}.webp`;
          if (!isDryRun) await uploadToCos(objectKey, buffer, "image/webp");
          urls.push(buildCosUrl(objectKey));
        }
      }
      return urls.length ? urls : null;
    };

    /**
     * 同一帖子除了「每个变体一张主图」之外，还常有一组**帖子级预览图**
     * （命名工坊把它们留成 `角色-名称-5 by 作者-1.jpg` 这种孤儿组）。
     * 它们不属于任何变体，但都是这个 mod 的可用图，应该并进每个版本的画廊。
     *
     * 识别：帖子基础名去掉末尾编号得到 `角色-名称`，再要求同一个 `by 作者`；
     * 排除所有变体自己的 base。这样不会把别的 mod 的图卷进来。
     */
    const uploadSharedImages = async (gm) => {
      const baseName = gm.group.baseName || gm.title;
      const authorMatch = /\s+by\s+(.+)$/i.exec(baseName);
      const author = authorMatch ? authorMatch[1].trim() : "";
      const stem = (authorMatch ? baseName.slice(0, authorMatch.index) : baseName)
        .replace(/\s+\d+\s*$/, "")
        .trim();
      if (!stem) return [];
      const stemKey = normalizeGroupKey(stem);
      const authorKey = author ? normalizeGroupKey(`by ${author}`) : "";
      const variantKeys = new Set(gm.group.variants.map((variant) => normalizeGroupKey(variant.name)));
      const sharedBases = [...imageIndex.byBase.keys()]
        .filter((base) => {
          const key = normalizeGroupKey(base);
          if (!key.startsWith(stemKey)) return false;
          if (authorKey && !key.includes(authorKey)) return false;
          return !variantKeys.has(key);
        })
        .sort();

      const entries = [];
      const seenFiles = new Set();
      for (const base of sharedBases) {
        for (const entry of lookupImages(imageIndex, base)) {
          if (seenFiles.has(entry.file)) continue;
          seenFiles.add(entry.file);
          entries.push(entry);
        }
      }
      if (entries.length === 0) return [];

      const urls = [];
      const slug = slugify(gm.character);
      for (const [idx, entry] of entries.entries()) {
        const name = idx === 0 ? "preview" : `preview-${idx + 1}`;
        const objectKey = `mods/${slug}/${gm.modId}/shared/${name}.webp`;
        if (isDryRun) {
          urls.push(buildCosUrl(objectKey));
          continue;
        }
        const { buffer } = await convertToWebP(entry.file);
        await uploadToCos(objectKey, buffer, "image/webp");
        urls.push(buildCosUrl(objectKey));
      }
      console.log(`   🖼  ${gm.character} | ${gm.title}  (帖子级预览图 ${urls.length} 张)`);
      return urls;
    };

    // 3d. 该目录的迅雷导出（可能没有：那就只有夸克一个盘）
    const xunleiDay = xunleiIndex.get(dir.name) || null;
    driveCoverage[dateLabel] = { quark: unique.length, xunlei: 0, xunleiExported: xunleiDay?.exported ?? 0 };
    if (xunleiDay) console.log(`   迅雷导出: ${xunleiDay.exported} 条`);

    // 3e. 读取分组清单：同一 GameBanana 帖子的多个附件合并成一条记录
    const manifest = readModGroupsFile(dirPath);
    const matchPlan = manifest
      ? matchRecordsToGroups(unique, manifest)
      : { groups: [], recordHits: new Map(), unmatched: [] };
    if (!manifest) console.log("   （无 .mod-groups.json，按旧逻辑逐条入库）");
    for (const item of matchPlan.unmatched) {
      console.log(`   ⚠️ 清单变体未匹配到分享: ${item.group.postUrl} / ${item.variant.label}`);
    }

    const groupAcc = new Map();
    const dirDay = paddedDayKey(dir.date);
    for (const gm of matchPlan.groups) {
      const baseKey = dedupKey(gm.group.character, gm.group.title);
      const baseName = normalizeGroupKey(gm.group.baseName || gm.group.variants[0]?.name || "");
      /**
       * 一个变体在库里对应哪一行（没有就是 undefined）。
       * 同一天被逐条插出来的「拆分行」可以自动合并；更早日期的已发布变体卡
       * 仍然按历史数据保护，避免把用户以前单独发布过的内容吞掉。
       */
      const variantRow = (variant) => {
        const parsed = resolveCharacterAndTitle(variant.name);
        const key = dedupKey(parsed.character, parsed.title);
        return { parsed, key, row: existingByKey.get(key) };
      };
      const sameDaySplitRows = gm.matches
        .map(({ variant }) => {
          if (normalizeGroupKey(variant.name) === baseName) return null;
          const { row } = variantRow(variant);
          if (!row?.is_published) return null;
          if (shanghaiDayKey(row.created_at) !== dirDay) return null;
          // 基行永远保留（哪怕它的名字解析和 baseName 有细微差异）
          if (row.id === existingByKey.get(baseKey)?.id) return null;
          return { id: row.id, variant };
        })
        .filter(Boolean);
      const hasOlderPublishedVariant = gm.matches.some(({ variant }) => {
        if (normalizeGroupKey(variant.name) === baseName) return false;
        const { row } = variantRow(variant);
        return Boolean(row?.is_published) && shanghaiDayKey(row.created_at) !== dirDay;
      });

      if (hasOlderPublishedVariant) {
        skippedLegacyGroups++;
        console.log(`   ⚠️ 帖子已有历史分版本行，跳过合并: ${gm.group.postUrl}`);
        for (const match of gm.matches) matchPlan.recordHits.delete(match.record);
        continue;
      }
      if (sameDaySplitRows.length > 0) {
        autoHealGroups++;
        autoUnpublishIds.push(...sameDaySplitRows.map((item) => item.id));
        console.log(
          `   🩹 合并同一天被拆开的 ${sameDaySplitRows.length} 行: ${gm.group.postUrl}`,
        );
      }
      // 清单里的基础标题必须仍能解析成同一个角色，否则宁可不合并
      const parsedBase = gm.group.baseName ? resolveCharacterAndTitle(gm.group.baseName) : null;
      if (parsedBase && gm.group.character && parsedBase.character !== gm.group.character) {
        console.log(`   ⚠️ 清单基础标题解析出的角色不一致，跳过合并: ${gm.group.postUrl}`);
        for (const match of gm.matches) matchPlan.recordHits.delete(match.record);
        continue;
      }
      // matchRecordsToGroups 的 recordHits.group 指向清单里的内层 group，
      // 而 gm 是外层包装；两边共享同一份状态，循环和后处理都读得到。
      const autoHeal = sameDaySplitRows.length > 0;
      const state = {
        baseKey,
        // 已有合并行时沿用它的 id：--refresh-images 上传的对象前缀要和库内那行一致
        modId: existingByKey.get(baseKey)?.id ?? randomUUID(),
        character: gm.group.character || parsedBase?.character || "",
        title: gm.group.title || parsedBase?.title || "",
        items: [],
        autoHeal,
        // 基础行已在库时这次只会补链接，不重复传图（图片沿用库里那张）。
        // 但自动合并当天拆分行时，基础行本身只是一张拆分卡，必须重新整理图片。
        skipImages: existingSet.has(baseKey) && !autoHeal,
      };
      Object.assign(gm, state);
      Object.assign(gm.group, state);
      groupAcc.set(gm.group.postUrl, gm);
    }

    // 3f. 逐条处理
    for (const record of unique) {
      // 导出名 → 本地规范名（见 KEY_ALIASES）。分类与预览图走规范名，
      // 迅雷链接仍按导出名查（xlsx 侧的键就是导出名）。
      const canonicalKey = resolveCanonicalKey(record.key);
      const { character, title } = resolveCharacterAndTitle(canonicalKey);
      const xunlei = lookupXunlei(xunleiDay?.index, record.key);
      // 覆盖表按「查到了链接」计数，不看这条最后有没有入库 —— 否则重跑（全被去重跳过）
      // 会显示成「有导出但一条都没匹配上」，把正常的去重误报成漏盘。
      if (xunlei) driveCoverage[dateLabel].xunlei++;

      const groupHit = matchPlan.recordHits.get(record);

      // 没命中清单的记录完全保持旧行为：库内有就只重新上架，没有就单条入库
      if (!groupHit) {
        const dkey = dedupKey(character, title);
        if (existingSet.has(dkey)) {
          skipDup++;
          skipDupKeys.push(`${dateLabel} · ${character} | ${title}`);
          // 2026-10-30 用户要求：**不管库里有没有，这一天上传的东西都要出现在「每日更新」**。
          // 做法是把库内那一行的 created_at 推到本目录日期 —— 本项目的 created_at 一直是
          // 「归属哪一天上传」的语义（见文件头第 2 条、noonShanghaiISO），不新增行，
          // 去重键 `character|title` 也不变，所以不会重复入库。
          // 只往前推：单跑一个老目录（--dates=2026.10.19）时不能把已经在更晚日期上架过的
          // 记录挪回过去，否则「最新」和每日更新都会倒退。
          const hit = existingByKey.get(dkey);
          const fromDay = hit ? shanghaiDayKey(hit.created_at) : "";
          if (hit && fromDay && fromDay < paddedDayKey(dir.date)) {
            redated.push({
              id: hit.id,
              character,
              title,
              fromDay,
              toDay: paddedDayKey(dir.date),
              createdAt: created_at,
            });
          }
          // 库内已有这条，本轮不会写库。只在「这次拿到了迅雷链接」且「库里那条还没有」
          // 时才提醒 —— 否则每次都把已经补好的记录再列一遍，提醒就没人看了。
          if (xunlei && !existingHasXunlei.has(dkey)) xunleiBacklog.push(`${dateLabel} · ${character} | ${title}`);
          // 封面还是占位图（首次上传时本地图还没就位）：--refresh-images 时补一张
          if (refreshImages && isPlaceholderImage(hit?.images?.[0])) {
            const urls = await refreshRowImages(canonicalKey, hit.id, character);
            if (urls) {
              imageUpdates.push({ id: hit.id, images: urls, variantImages: {} });
              refreshedImages++;
              console.log(`   🖼  ${dateLabel} ${character} | ${title}  (补封面)`);
            }
          }
          continue;
        }
      }

      const modId = groupHit ? groupHit.group.modId : randomUUID();
      const version = extractVersion(groupHit ? groupHit.group.title : title);

      // 多图：首图 → preview.webp，第 2 张起 → preview-2.webp / preview-3.webp …
      // images 数组的顺序就是站内顺序（images[0] 是封面，见 mappers.ts）。
      // 覆盖表命中的条目直接复用站内图片 URL，不读、不传本地预览图。
      // 合并组每个变体都要传自己的图：基变体沿用根前缀（旧封面路径不变），
      // 其余变体放到 `v2-xxx/` 子目录，避免互相覆盖。
      const shouldProcessImages = !groupHit || refreshImages || !groupHit.group.skipImages;
      const variantIndex = groupHit
        ? groupHit.group.variants.findIndex((variant) => variant.label === groupHit.variant.label)
        : -1;
      const variantFolder =
        groupHit && variantIndex > 0 ? `${variantIndex + 1}-${slugify(groupHit.variant.label)}` : "";
      const overrideUrl = shouldProcessImages ? IMAGE_URL_OVERRIDES.get(canonicalKey) : undefined;
      const imageEntries = shouldProcessImages && !overrideUrl ? lookupImages(imageIndex, canonicalKey) : [];
      const imageUrls = [];
      if (!shouldProcessImages) {
        // 已有合并行且不是 --refresh-images：图片沿用库里那套
      } else if (overrideUrl) {
        imageUrls.push(overrideUrl);
        matchedImage++;
        console.log(`   🖼  ${dateLabel} ${character} | ${title}  (复用站内图)`);
      } else if (imageEntries.length === 0) {
        // 非基变体没有本地图时留空，前台回退到基变体的图；不给它塞占位图
        if (!groupHit || variantIndex === 0) {
          imageUrls.push(PLACEHOLDER_IMAGE_URL);
          placeholder++;
          placeholderKeys.push(`${dateLabel} · ${character} | ${title}`);
        }
      } else {
        if (imageEntries.length > 1) {
          multiImageMods++;
          extraImageCount += imageEntries.length - 1;
        }
        const slug = slugify(character);
        for (const [idx, entry] of imageEntries.entries()) {
          const name = idx === 0 ? "preview" : `preview-${idx + 1}`;
          const label = idx === 0 ? "" : `  [图 ${idx + 1}]`;
          try {
            const { buffer, origSizeKB, webpSizeKB, reduction } = await convertToWebP(entry.file);
            const objectKey = `mods/${slug}/${modId}/${variantFolder ? `${variantFolder}/` : ""}${name}.webp`;
            if (isDryRun) {
              imageUrls.push(buildCosUrl(objectKey));
              console.log(
                `   🖼  ${dateLabel} ${character} | ${title}${label}  (${origSizeKB}KB → ${webpSizeKB}KB, -${reduction}%)`
              );
            } else {
              await uploadToCos(objectKey, buffer, "image/webp");
              imageUrls.push(buildCosUrl(objectKey));
              console.log(`   ✅ ${dateLabel} ${character} | ${title}${label}`);
            }
          } catch (err) {
            console.error(`   ❌ ${entry.file}: ${err.message}`);
            // 首图失败才落占位图；额外图失败只是少一张，不把主图挤掉
            if (idx === 0 && (!groupHit || variantIndex === 0)) {
              imageUrls.push(PLACEHOLDER_IMAGE_URL);
              placeholder++;
              placeholderKeys.push(`${dateLabel} · ${character} | ${title}`);
            }
          }
        }
        if (imageUrls.length > 0 && imageUrls[0] !== PLACEHOLDER_IMAGE_URL) matchedImage++;
      }

      // 夸克恒有（来自 CSV）；迅雷有就一起写进去，免得事后还得跑第二个脚本补
      const driveLinks = [{ platform: "夸克网盘", url: record.url }];
      if (xunlei) {
        // 手抄 txt 的链接不带提取码，这里统一拼成「打开即自动填码」的形式，
        // 与 xlsx 导出表（链接列自带 ?pwd=）落库的形态保持一致
        driveLinks.push({ platform: "迅雷网盘", url: withXunleiPwd(xunlei.link, xunlei.pwd) });
        xunleiAttached++;
      }

      if (groupHit) {
        // 链接带上变体标签，前台据此分组；真正入库在循环结束后统一做
        for (const link of driveLinks) link.variant = groupHit.variant.label;
        groupHit.group.items.push({ record, hit: groupHit, driveLinks, imageUrls });
        continue;
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
        description: `${character} ${title} MOD，${driveLinks.map((d) => d.platform).join(" / ")}下载。`,
        download_url: null,
        drive_links: driveLinks,
        variant_images: {},
        nsfw: false,
        is_published: true,
        is_available: true,
        images: imageUrls,
        xxmi_install_guide: XXMI_GUIDE,
        mod_author_url: null,
        video_url: null,
        created_by: null,
        created_at, // 显式设置：归属该日期，保证每日更新页按日期分组
      });
    }

    // 3g. 生成合并记录：一个帖子一条，链接按变体分组，图片也按变体存
    for (const gm of groupAcc.values()) {
      if (gm.items.length < 2) continue;
      // CSV 的记录顺序不等于清单的版本顺序；按清单排一次，
      // 保证基变体（Normal SFW / Slim SFW）排第一，前台默认选中它、封面与画廊一致。
      const variantRank = new Map(gm.group.variants.map((variant, index) => [variant.label, index]));
      const orderedItems = [...gm.items].sort(
        (a, b) =>
          (variantRank.get(a.hit.variant.label) ?? Number.MAX_SAFE_INTEGER) -
          (variantRank.get(b.hit.variant.label) ?? Number.MAX_SAFE_INTEGER),
      );
      const baseItem = orderedItems.find((item) => item.hit.variant === gm.group.variants[0]) ?? orderedItems[0];
      // 帖子级预览图（不属于任何变体的孤儿组）并入每个版本的画廊
      const sharedUrls = !gm.skipImages || refreshImages ? await uploadSharedImages(gm) : [];
      const variantImages = Object.fromEntries(
        orderedItems
          .map((item) => {
            const own = item.imageUrls.filter((url) => url !== PLACEHOLDER_IMAGE_URL);
            return [item.hit.variant.label, [...own, ...sharedUrls]];
          })
          .filter(([, urls]) => urls.length > 0),
      );
      // 封面优先用基变体的图；基变体没图就退到任意一个有图的变体，再退占位图
      const baseOwn = baseItem.imageUrls.filter((url) => url !== PLACEHOLDER_IMAGE_URL);
      const coverImages = [...baseOwn, ...sharedUrls];
      if (coverImages.length === 0) coverImages.push(PLACEHOLDER_IMAGE_URL);
      const driveLinks = dedupeGroupLinks(orderedItems.flatMap((item) => item.driveLinks));
      const labels = [...new Set(orderedItems.map((item) => item.hit.variant.label))];
      const platforms = [...new Set(driveLinks.map((link) => link.platform))];
      const nsfw =
        labels.some((label) => /nsfw/i.test(label)) ||
        orderedItems.some((item) => /nsfw/i.test(item.hit.variant.sourceName ?? ""));

      const merged = {
        id: gm.modId,
        title: gm.title,
        character: gm.character,
        game_key: GAME_KEY,
        game_version: GAME_VERSION,
        version: extractVersion(gm.title),
        description: `${gm.character} ${gm.title} MOD，共 ${labels.length} 个版本：${labels.join(" / ")}；${platforms.join(" / ")}下载。`,
        download_url: null,
        drive_links: driveLinks,
        variant_images: variantImages,
        nsfw,
        is_published: true,
        is_available: true,
        images: coverImages,
        xxmi_install_guide: XXMI_GUIDE,
        mod_author_url: null,
        video_url: null,
        created_by: null,
        created_at, // 显式设置：归属该日期，保证每日更新页按日期分组
      };

      if (existingSet.has(gm.baseKey)) {
        // 基础行已在库：链接求并集、created_at 只前进；不再重复插一条
        const existingRow = existingByKey.get(gm.baseKey);
        mergedUpdates.push({ id: existingRow.id, createdAt: created_at, driveLinks });
        // --refresh-images 或自动合并当天拆分行：把每个变体这一轮传上去的图写回
        if ((refreshImages || gm.autoHeal) && Object.keys(variantImages).length > 0) {
          imageUpdates.push({ id: existingRow.id, images: coverImages, variantImages });
          refreshedImages++;
          console.log(`   🖼  ${gm.character} | ${gm.title}  (刷新 ${Object.keys(variantImages).length} 个版本预览图)`);
        }
      } else {
        results.push(merged);
      }
      charCount[gm.character] = (charCount[gm.character] ?? 0) + 1;
      mergedGroups++;
      mergedVariants += gm.items.length;
      console.log(
        `   🧩 合并: ${gm.character} | ${gm.title}（${gm.items
          .map((item) => `${item.hit.variant.label} ${item.driveLinks.length} 链接`)
          .join(" / ")}）`,
      );
    }
    console.log("");
  }

  console.log(`\n✅ 匹配预览图: ${matchedImage}，占位图: ${placeholder}，去重跳过: ${skipDup}`);
  if (multiImageMods > 0) {
    console.log(`🖼  多图预览: ${multiImageMods} 条（首图之外的额外图 ${extraImageCount} 张）`);
  }
  console.log(`⚡ 附上迅雷链接: ${xunleiAttached} 条`);
  if (mergedGroups > 0 || skippedLegacyGroups > 0) {
    console.log(
      `🧩 合并帖子: ${mergedGroups} 个（版本 ${mergedVariants} 条，历史分卡跳过 ${skippedLegacyGroups} 个）`,
    );
  }
  if (mergedUpdates.length > 0) console.log(`🔗 合并链接待更新: ${mergedUpdates.length} 条`);

  // 网盘覆盖表：一个日期目录里认出了哪几个盘、实际挂上了几个。
  // 「导出条数」与「挂上条数」不等就是漏网盘的前兆，所以单独标出来而不是只打总数。
  const coverageRows = Object.entries(driveCoverage);
  if (coverageRows.length) {
    console.log("\n=== 网盘覆盖 ===");
    for (const [day, c] of coverageRows) {
      let flag = "";
      if (c.xunleiExported === 0) flag = "  ⚠️ 该目录无迅雷导出（确认是否漏导出）";
      else if (c.xunlei < c.xunleiExported) flag = `  ⚠️ 有 ${c.xunleiExported - c.xunlei} 条迅雷导出未匹配上`;
      console.log(`   ${day}  夸克 ${c.quark} / 迅雷 ${c.xunlei}（导出 ${c.xunleiExported}）${flag}`);
    }
  }

  if (skipDupKeys.length) {
    console.log("\n⏭️  已存在跳过:");
    skipDupKeys.forEach((k) => console.log(`   - ${k}`));
  }

  // 这类记录本轮不写库（库内已有），迅雷链接不会自动补上——正是「漏了迅雷」的复发点，
  // 所以单独指路，而不是混在「已存在跳过」里让人忽略。
  if (xunleiBacklog.length) {
    console.log(`\n⚠️  以下 ${xunleiBacklog.length} 条库内已存在，本次拿到的迅雷链接未写入:`);
    xunleiBacklog.forEach((k) => console.log(`   - ${k}`));
    console.log("   补链接请跑: node scripts/apply-daily-xunlei-by-date.mjs （默认 dry-run，加 --apply 写库）");
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

  // 只报「这次真的会把日期推前」的，已经在该日期上的不重复刷屏（重跑要幂等）
  if (redated.length) {
    console.log(`\n🔁 重新上架（库内已存在，created_at 推到本目录日期）: ${redated.length} 条`);
    redated.forEach((r) => console.log(`   - ${r.toDay} · ${r.character} | ${r.title}（原 ${r.fromDay}）`));
  }

  if (isDryRun) {
    console.log(
      `\n🔍 DRY-RUN: 跳过入库，共 ${results.length} 条记录（含合并 ${mergedGroups} 条），重新上架 ${redated.length} 条，合并链接更新 ${mergedUpdates.length} 条，封面更新 ${imageUpdates.length} 条，下架拆分行 ${new Set(autoUnpublishIds).size} 条`,
    );
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

  // 重新上架：只把 created_at 推到本目录日期，让它在「每日更新」里出现在这一天。
  // 不新增行、不改其它列 —— 链接/封面各有各的脚本（update-drive-links-from-reshare /
  // reupload-mod-image），这里只解决「上传了、库里也有，但每日更新里看不见」。
  let reDated = 0;
  for (let i = 0; i < redated.length; i += BATCH_SIZE) {
    const batch = redated.slice(i, i + BATCH_SIZE);
    try {
      const outcome = await psqlJson(buildRedateSql(batch));
      reDated += Number(outcome?.updated ?? 0);
    } catch (err) {
      console.error(`   ❌ 重新上架批次失败: ${err.message}`);
    }
  }
  if (redated.length) console.log(`🔁 重新上架: 成功 ${reDated}/${redated.length} 条`);

  // 合并记录的基础行已在库：把本次拿到的变体链接并进去，created_at 只前进。
  // 不能走 buildRedateSql（它只改日期），否则新变体的链接会静默丢失。
  let mergedUpdated = 0;
  for (let i = 0; i < mergedUpdates.length; i += BATCH_SIZE) {
    const batch = mergedUpdates.slice(i, i + BATCH_SIZE);
    try {
      const outcome = await psqlJson(buildMergeDriveLinksSql(batch));
      mergedUpdated += Number(outcome?.updated ?? 0);
    } catch (err) {
      console.error(`   ❌ 合并链接更新批次失败: ${err.message}`);
    }
  }
  if (mergedUpdates.length) console.log(`🔗 合并链接更新: 成功 ${mergedUpdated}/${mergedUpdates.length} 条`);

  // --refresh-images：把占位封面替换成本地图（只改 images，尺寸由 syncCoverSizes 重算）
  let imagesUpdated = 0;
  for (let i = 0; i < imageUpdates.length; i += BATCH_SIZE) {
    const batch = imageUpdates.slice(i, i + BATCH_SIZE);
    try {
      const outcome = await psqlJson(buildImageUpdateSql(batch));
      imagesUpdated += Number(outcome?.updated ?? 0);
    } catch (err) {
      console.error(`   ❌ 封面更新批次失败: ${err.message}`);
    }
  }
  if (imageUpdates.length) console.log(`🖼  封面更新: 成功 ${imagesUpdated}/${imageUpdates.length} 条`);

  // 自动合并当天被拆开的变体行：合并完成后把这些重复行下架（不删除）
  let unpublished = 0;
  const uniqueUnpublishIds = [...new Set(autoUnpublishIds)];
  for (let i = 0; i < uniqueUnpublishIds.length; i += BATCH_SIZE) {
    const batch = uniqueUnpublishIds.slice(i, i + BATCH_SIZE);
    try {
      const outcome = await psqlJson(buildUnpublishSql(batch));
      unpublished += Number(outcome?.updated ?? 0);
    } catch (err) {
      console.error(`   ❌ 下架重复行批次失败: ${err.message}`);
    }
  }
  if (uniqueUnpublishIds.length) {
    console.log(`🧹 下架重复拆分行: 成功 ${unpublished}/${uniqueUnpublishIds.length} 条`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n📊 完成: 成功 ${inserted} 条, 失败 ${failed} 条 (耗时 ${elapsed} 分钟)`);

  // 有新数据才发布快照 / 通知。全部被去重跳过时缓存里本来就没变化，不必白敲一次。
  // 失败不影响脚本退出码：数据已经入库了，最坏是等一个 TTL 自然到期。
  // 顺序不能反：**先发布快照、再 ping**（理由见 notifyRevalidate 的注释）。
  // --dry-run 天然走不到这里（上面已 return）。
  if (inserted > 0 || reDated > 0 || mergedUpdated > 0 || imagesUpdated > 0 || unpublished > 0) {
    // 先补封面尺寸再发快照：快照要带上 cover_width/cover_height，否则新入库的这批
    // 在瀑布流里又要走「先按 3/4 排一遍再重排」的老路（见 scripts/cover-size.mjs）。
    // 只处理封面变过的行，正常一天十几条，几秒的事。
    try {
      const coverSync = await syncCoverSizes({
        bucket: cosBucket.trim(),
        region: cosRegion.trim(),
        log: (msg) => console.log(msg),
      });
      if (coverSync.scanned > 0) {
        console.log(
          `🖼  封面尺寸同步：扫描 ${coverSync.scanned}，写入 ${coverSync.updated}，取不到 ${coverSync.skipped}`,
        );
      }
    } catch (err) {
      // 不影响入库与快照：这一批最多退回兜底比例排版，下次上传会自动补上
      console.warn(`⚠️  封面尺寸同步失败：${err.message}`);
    }

    await publishSnapshotBestEffort();
    await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });
    purgeHkCacheBestEffort();
  }
}

/**
 * 清香港反代的**整层**缓存。
 *
 * 为什么上传后必须有这一步：nginx 的 TTL 2026-10-29 提到 6 小时（见
 * `deploy/hk-proxy/nginx/wavemod-proxy.conf.template`），而 `/api/revalidate`
 * 只清得到 Vercel 那一层 —— 香港这台机器照样把旧列表发出去最长 6 小时。
 * TTL 拉长的前提就是「发布时主动失效」，所以这一步和 ping 是一对，不能只留一个。
 *
 * 失败只告警不翻红：数据已经入库，最坏是新 mod 晚 6 小时出现在列表里，
 * 不该让一次成功的上传显示成失败；但它是那种「终端看着挺绿、前台静悄悄不动」
 * 的故障，所以告警写足三行，并给出补跑命令。
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
  console.warn("   新内容最坏要等 nginx TTL（6 小时）自然过期才出现，补跑：");
  console.warn("   node scripts/purge-hk-api-cache.mjs --all");
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

// 给 scripts/check-mod-keys.mjs 用：重命名后先算一遍分类，别等上传才发现造出新角色
export { resolveCharacterAndTitle, dedupKey };

// 只有直接运行才跑主流程；被 import 时（自检脚本 / 单测）不能触发上传
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("❌ 脚本执行失败:", err);
    process.exit(1);
  });
}
