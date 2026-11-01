/**
 * 扫描层：只读 fs，把「日期目录里的来源文件夹」变成一串条目 + 原帖元数据。
 *
 * 元数据来自爬虫仓库（默认 `<A_每日更新>/../wuwa_mod_crawl`）：
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
    for (const img of item.images ?? []) if (img.file) map.set(img.file, meta);
    for (const f of item.files ?? []) if (f.file) map.set(f.file, meta);
  }
  return map;
}

function listEntries(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !SKIP_PREFIX.some((p) => e.name.startsWith(p)))
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

  const rows = primaries.map((p) => ({
    name: p.name,
    base: p.base,
    kind: p.kind,
    ext: p.ext,
    size: p.size,
    isDir: p.isDir,
    images: (attached.get(p.base) ?? []).map((i) => i.name),
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
  return { dateDir, sources };
}
