/**
 * 扫描层：只读 fs，把「日期目录里的来源文件夹」变成一串条目 + 原帖元数据。
 *
 * 元数据来自爬虫仓库（默认本仓库的 `tools/wuwa_mod_crawl`，可用
 * `WAVE_MOD_CRAWL_DIR` 覆盖；旧布局 `<A_每日更新>/../wuwa_mod_crawl` 仍作为兜底）：
 *   - `state.arca_downloads.json` / `state.gb_downloads.json` 里记着**每个本地文件对应哪篇帖**，
 *     这是唯一可靠的「文件 → 标题/作者」映射，别靠文件名猜；
 *   - GameBanana 的作者/子分类在 `_Mod每日汇总/GameBanana/*.csv` 里，按 mod_id join。
 * 找不到元数据时照样能扫出条目，只是没有作者/分类，建议名会标黄。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const MOD_EXTS = new Set([".exe", ".7z", ".zip", ".rar"]);
export const IMG_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** 来源目录里这些前缀不是待处理的 mod：`_合集原包`、`_Endfield`、`arca_需手动下载.txt` */
const SKIP_PREFIX = ["_", "arca_需手动下载"];

/**
 * 爬虫给「老 Mod 更新」留的子目录（`GameBanana/更新/`）。里面是已上架 Mod 的新版本
 * 附件，不是当天新增的 Mod —— 当成条目列出来只会被再命名/再上传一遍。
 */
export const UPDATE_DIR = "更新";

/** 日期目录顶层也算一个来源：整理好/搬上去的包仍要能改名（见 listDateRoot） */
export const ROOT_SOURCE = "根目录";
const ROOT_SKIP = new Set(["arca.live", "GameBanana", "预览图"]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** `W-2026.11.01` → `2026-11-01`；不是日期目录返回 null */
export function dateDirToDay(name) {
  const m = /^W-(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(name);
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
}

export function listDateDirs(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && dateDirToDay(e.name))
    .map((e) => ({ name: e.name, day: dateDirToDay(e.name), path: join(base, e.name) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** 极简 CSV 解析：支持引号包裹与 `""` 转义，够读爬虫导出的表 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** arca 下载队列：本地文件名 → 原帖标题/作者 */
export function arcaMetaMap(crawlDir) {
  const map = new Map();
  const state = readJson(join(crawlDir, "state.arca_downloads.json"));
  for (const item of Object.values(state?.items ?? {})) {
    const meta = {
      title: item.title ?? "",
      author: item.author ?? "",
      day: item.day ?? "",
      url: item.page_url ?? "",
      status: item.status ?? "",
    };
    for (const img of item.images ?? []) if (img.file) map.set(img.file, meta);
    for (const mod of item.mods ?? []) {
      for (const f of mod.files ?? []) if (f.file) map.set(f.file, meta);
    }
    // 用户把下载的目录解压/整理过之后，状态里的文件名就对不上了（比如
    // `.../111.ini` 还在，但主条目已经变成同名的目录或重新打的 exe）。
    // 下载器记的 `base` 是标题清洗后的基名，正好和这些条目的 base 一致，
    // 补一层兜底，作者/分类才不至于丢 —— 丢了会导致 AI 乱猜角色。
    if (item.base && !map.has(item.base)) map.set(item.base, meta);
  }
  return map;
}

/** GameBanana 下载队列 + 汇总 CSV：本地文件名 → 名称/作者/子分类 */
export function gbMetaMap(crawlDir, summaryDir) {
  const byModId = new Map();
  const summaryGb = join(summaryDir, "GameBanana");
  if (existsSync(summaryGb)) {
    for (const f of readdirSync(summaryGb)) {
      if (!f.toLowerCase().endsWith(".csv") || !f.startsWith("W-")) continue;
      const rows = parseCsv(readFileSync(join(summaryGb, f), "utf8"));
      const header = rows.shift() ?? [];
      const idx = (name) => header.indexOf(name);
      for (const r of rows) {
        const modId = r[idx("mod_id")];
        if (!modId) continue;
        byModId.set(modId, {
          author: r[idx("作者")] ?? "",
          category: r[idx("分类")] ?? "",
          subcategory: r[idx("子分类")] ?? "",
          version: r[idx("版本")] ?? "",
          pageUrl: r[idx("页面链接")] ?? "",
        });
      }
    }
  }

  const map = new Map();
  const state = readJson(join(crawlDir, "state.gb_downloads.json"));
  for (const [modId, item] of Object.entries(state?.items ?? {})) {
    const extra = byModId.get(String(modId)) ?? byModId.get(String(item.mod_id)) ?? {};
    const meta = {
      title: item.name ?? "",
      author: extra.author ?? "",
      subcategory: extra.subcategory ?? "",
      category: extra.category ?? "",
      version: extra.version ?? "",
      day: item.day ?? "",
      url: item.page_url ?? extra.pageUrl ?? "",
      status: item.status ?? "",
    };
    // 每个附件单独带一份 meta：`src` 是下载前的原始文件名，里面通常有
    // `_sfw` / `_nsfw` / `_thicc` 这类变体词，用于同一帖子多附件时区分名字。
    for (const img of item.images ?? []) {
      if (img.file) map.set(img.file, { ...meta, src: img.src ?? "" });
    }
    for (const f of item.files ?? []) {
      if (f.file) map.set(f.file, { ...meta, src: f.src ?? "" });
    }
    // 同 arca：下载后解压成目录、再用 SFX 打成同名 exe 时，state 里记的还是
    // 原来的 `X.zip`，主条目却已经变成 `X` / `X.exe`。用下载器记的
    // `file_base` / `image_base` 兜底，才能拿回作者和 GameBanana 子分类
    // （子分类是角色提示的唯一可靠来源，丢了 AI 会猜成多角色）。
    for (const key of [item.file_base, item.image_base]) {
      if (key && !map.has(key)) map.set(key, meta);
    }
  }
  return map;
}

function listEntries(dir, skipNames = null) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !SKIP_PREFIX.some((p) => e.name.startsWith(p)))
    .filter((e) => !skipNames?.has(e.name))
    .filter((e) => !(e.isDirectory() && e.name === UPDATE_DIR))
    .filter((e) => !e.isSymbolicLink())
    .map((e) => {
      const full = join(dir, e.name);
      const isDir = e.isDirectory();
      const ext = isDir ? "" : extname(e.name).toLowerCase();
      const kind = isDir ? "dir" : MOD_EXTS.has(ext) ? "mod" : IMG_EXTS.has(ext) ? "image" : "other";
      return {
        name: e.name,
        base: isDir ? e.name : basename(e.name, ext),
        kind,
        ext,
        isDir,
        size: isDir ? 0 : statSync(full).size,
        path: full,
      };
    })
    .filter((e) => e.kind !== "other")
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

/** 爬虫给多图/多附件加的后缀：`_1` / `-2`，分组时要先剥掉 */
export function stripNumberSuffix(base) {
  return String(base).replace(/[-_]\d+$/, "");
}

/** 预览图编号：没有后缀的是封面（0），`-1`/`_1` 是第 1 张。 */
function imageOrder(img) {
  const m = /[-_](\d+)$/.exec(img.base);
  return m ? Number(m[1]) : 0;
}

/**
 * 预览图必须按「封面 → -1 → -2 …」排序。
 * 目录项是按名字排序读进来的，而 `-` 比 `.` 小，所以 `X-1.jpg` 会排在 `X.jpg` 前面；
 * 直接拿这个顺序去改名，会把 `-1` 当成封面、把封面当成 `-N`，整个编号错位 ——
 * 对已经命名好的条目再点一次应用就会撞名失败。
 */
function sortImages(list) {
  return list.sort((a, b) => imageOrder(a) - imageOrder(b) || a.name.localeCompare(b.name, "zh"));
}

/**
 * 把「一堆文件」整理成「一行一个 mod」：
 *   - mod 文件 / 目录是主条目；
 *   - 预览图按 base（剥掉 `_1`/`-1` 编号）挂到对应主条目上；
 *   - 没有主条目的图（arca 的「需手动下载」条目只有图）自成一行，第一张当主条目、其余挂上去。
 */
export function buildRows(entries, metaMap = new Map()) {
  const images = entries.filter((e) => e.kind === "image");
  const primaries = entries.filter((e) => e.kind !== "image");
  const primaryBases = new Set(primaries.map((p) => p.base));

  const attached = new Map();
  const orphans = new Map();
  for (const img of images) {
    const stripped = stripNumberSuffix(img.base);
    const owner = primaryBases.has(img.base) ? img.base : primaryBases.has(stripped) ? stripped : null;
    const bucket = owner ? attached : orphans;
    const key = owner ?? stripped;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(img);
  }

  // 封面必须排在 `-1` 前面，否则重新应用时编号会整体错位（见 sortImages）
  for (const list of attached.values()) sortImages(list);
  for (const list of orphans.values()) sortImages(list);

  // 同一 base 可能同时有目录和打好的 exe（build.ps1 不删源目录）。
  // 预览图只能挂给其中一条：否则两行都去改同一张图，第二行必定撞名/找不到源文件。
  // 优先挂给可发布的那份（exe/zip/rar），没有才挂目录。
  const ownerByBase = new Map();
  for (const p of primaries) {
    const current = ownerByBase.get(p.base);
    if (!current || (current.isDir && !p.isDir)) ownerByBase.set(p.base, p);
  }

  const rows = primaries.map((p) => ({
    name: p.name,
    base: p.base,
    kind: p.kind,
    ext: p.ext,
    size: p.size,
    isDir: p.isDir,
    images: ownerByBase.get(p.base) === p ? (attached.get(p.base) ?? []).map((i) => i.name) : [],
    meta: metaMap.get(p.name) ?? metaMap.get(p.base) ?? null,
  }));

  for (const [base, imgs] of orphans) {
    const [primary, ...rest] = imgs;
    rows.push({
      name: primary.name,
      base,
      kind: "image",
      ext: primary.ext,
      size: primary.size,
      isDir: false,
      images: rest.map((i) => i.name),
      meta: metaMap.get(primary.name) ?? metaMap.get(base) ?? null,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

/**
 * 扫一个日期目录。返回每个来源的条目列表，并把元数据挂到条目上。
 * `meta` 可以按完整文件名或去扩展名的 base 命中 —— 爬虫有时给图加 `_1`，mod 给 `.zip`。
 */
export function scanDateDir(dateDir, { crawlDir, summaryDir } = {}) {
  const arca = crawlDir ? arcaMetaMap(crawlDir) : new Map();
  const gb = crawlDir ? gbMetaMap(crawlDir, summaryDir ?? "") : new Map();

  const sources = [];
  for (const [sourceName, metaMap] of [
    ["arca.live", arca],
    ["GameBanana", gb],
  ]) {
    const dir = join(dateDir, sourceName);
    if (!existsSync(dir)) continue;
    const items = buildRows(listEntries(dir), metaMap).map((r) => ({ ...r, source: sourceName }));
    sources.push({ name: sourceName, path: dir, items });
  }

  // 日期目录顶层：用户把命名好的包/打好的 exe 搬上来之后，工具仍要能看见它们
  // （以前只能扫两个来源子目录，搬走后就「改不了」了）。脚本、日志、预览图目录、
  // 来源子目录都排除；能识别成 mod 的才列出来。
  const rootItems = buildRows(
    listEntries(dateDir, ROOT_SKIP),
    new Map([...arca, ...gb])
  ).map((r) => ({ ...r, source: ROOT_SOURCE }));
  if (rootItems.length) sources.push({ name: ROOT_SOURCE, path: dateDir, items: rootItems });

  return { dateDir, sources };
}
