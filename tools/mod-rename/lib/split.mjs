/**
 * 拆包：一个合集 zip 里有多个角色的皮肤时，按顶层目录拆成多个单角色 zip。
 *
 * 三条硬规则（都是 2026-11-01 手工拆分时踩出来的）：
 *   1. **字节搬运**，不解压不重压缩 —— 产物里的压缩数据与源包逐字节一致；
 *   2. **必须对账**：拆出来的文件数和字节数之和，必须等于源包里被分配的那些子树，
 *      不等就整批回滚，绝不留下「少了一个贴图」的包；
 *   3. **源包不删**，连同合集长图一起移到 `_合集原包/`，出问题还能重来。
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { assertSafeName } from "./journal.mjs";
import { copyEntriesToZip, listZipEntries } from "./zip.mjs";

export const IMG_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const ARCHIVE_DIR = "_合集原包";

const topOf = (name) => (name.includes("/") ? name.split("/")[0] : "");
const isPlaceholder = (entry) => entry.isDir || entry.compSize === 0;

function statTop(entries) {
  const map = new Map();
  for (const e of entries) {
    if (isPlaceholder(e)) continue;
    const top = topOf(e.name);
    if (!map.has(top)) map.set(top, { name: top, files: 0, bytes: 0, entries: [] });
    const t = map.get(top);
    t.files++;
    t.bytes += e.size;
    t.entries.push(e);
  }
  return map;
}

/** 列出合集包的顶层分布，供页面展示「这个包里有哪几个角色」 */
export function inspectZip(zipPath) {
  const { entries, fileSize } = listZipEntries(zipPath);
  const tops = [...statTop(entries).values()].map((t) => ({
    name: t.name,
    files: t.files,
    bytes: t.bytes,
  }));
  return {
    fileSize,
    totals: {
      files: tops.reduce((s, t) => s + t.files, 0),
      bytes: tops.reduce((s, t) => s + t.bytes, 0),
    },
    topLevel: tops.sort((a, b) => a.name.localeCompare(b.name, "zh")),
  };
}

/**
 * 计划一次拆分（不落盘）。
 * @param {string} zipPath
 * @param {{packName:string, tops:string[]}[]} groups
 */
export function planSplit(zipPath, groups) {
  const { entries, fileSize } = listZipEntries(zipPath);
  const topMap = statTop(entries);
  const errors = [];
  const seen = new Map(); // top -> packName
  const names = new Set();

  const planned = groups.map((g) => {
    try {
      assertSafeName(g.packName);
    } catch (err) {
      errors.push(`包名不合法「${g.packName}」：${err.message}`);
    }
    if (names.has(g.packName)) errors.push(`包名重复：${g.packName}`);
    names.add(g.packName);

    let files = 0;
    let bytes = 0;
    const tops = [];
    for (const top of g.tops ?? []) {
      const t = topMap.get(top);
      if (!t) {
        errors.push(`源包里没有顶层目录：${top || "(根目录文件)"}`);
        continue;
      }
      if (seen.has(top)) errors.push(`「${top || "(根目录文件)"}」被分到了两个包`);
      seen.set(top, g.packName);
      tops.push(top);
      files += t.files;
      bytes += t.bytes;
    }
    if (!tops.length) errors.push(`包「${g.packName}」没有选中任何目录`);
    return { packName: g.packName, tops, files, bytes };
  });

  const leftovers = [...topMap.values()]
    .filter((t) => !seen.has(t.name))
    .map((t) => ({ name: t.name, files: t.files, bytes: t.bytes }));

  const assignedBytes = planned.reduce((s, p) => s + p.bytes, 0);
  const sourceBytes = [...topMap.values()].reduce((s, t) => s + t.bytes, 0);

  return { planned, leftovers, errors, fileSize, sourceBytes, assignedBytes, entries };
}

/** 归到 `_合集原包/` 的兄弟文件：同名 zip + 同名/带编号的合集长图 */
export function siblingsOf(sourceDir, zipName) {
  const base = basename(zipName, extname(zipName));
  const out = [];
  if (!existsSync(sourceDir)) return out;
  for (const name of readdirSync(sourceDir)) {
    if (name === zipName) continue;
    const ext = extname(name).toLowerCase();
    if (!IMG_EXTS.has(ext)) continue;
    const b = basename(name, ext);
    if (b === base || b.startsWith(`${base}_`) || b.startsWith(`${base}-`)) out.push(name);
  }
  return out;
}

/**
 * 执行拆分。
 *
 * @param {object} args
 * @param {string} args.zipPath 源合集包
 * @param {{packName:string, tops:string[]}[]} args.groups
 * @param {string} args.sourceDir 输出目录（= 源包所在目录）
 * @param {Record<string, Buffer>} [args.covers] 包名 → PNG 字节
 * @param {boolean} [args.archive] 是否把源包与合集长图移到 `_合集原包/`
 */
export function splitZip({ zipPath, groups, sourceDir, covers = {}, archive = true, ignore = [] }) {
  const plan = planSplit(zipPath, groups);
  if (plan.errors.length) {
    const err = new Error(`拆分计划有问题：\n${plan.errors.join("\n")}`);
    err.details = plan.errors;
    throw err;
  }
  // 显式「不要」的顶层目录也算交代过了；没交代的一律拒绝，避免静默丢文件
  const ignored = plan.leftovers.filter((l) => ignore.includes(l.name));
  const unassigned = plan.leftovers.filter((l) => !ignore.includes(l.name));
  if (unassigned.length) {
    const list = unassigned.map((l) => l.name || "(根目录文件)").join("、");
    throw new Error(`还有没分配的顶层目录：${list}（要么分配，要么勾掉确认不要）`);
  }

  const created = [];
  const results = [];
  try {
    for (const g of plan.planned) {
      const outPath = join(sourceDir, `${g.packName}.zip`);
      if (existsSync(outPath)) throw new Error(`目标已存在，拒绝覆盖：${g.packName}.zip`);
      const part = `${outPath}.part`;
      created.push(part);

      const tops = new Set(g.tops);
      const picked = plan.entries.filter((e) => tops.has(topOf(e.name)));
      const { written, bytes } = copyEntriesToZip(zipPath, picked, part, (entry) => {
        if (entry.isDir) return "";
        const rel = entry.name.includes("/") ? entry.name.slice(entry.name.indexOf("/") + 1) : entry.name;
        // 包内自带的预览图改名，避免和站内封面重复
        const renamed = rel.replace(/(^|\/)(preview|Preview)\.(png|jpe?g)$/, "$1screenshot.$3");
        return `${g.packName}/${renamed}`;
      });
      if (written !== g.files || bytes !== g.bytes) {
        throw new Error(
          `对账失败：${g.packName} 计划 ${g.files} 个文件 / ${g.bytes} 字节，实际 ${written} / ${bytes}`
        );
      }
      renameSync(part, outPath);
      created.push(outPath);
      results.push({ packName: g.packName, files: written, bytes });
    }

    // 封面
    for (const [packName, buf] of Object.entries(covers ?? {})) {
      if (!buf || !buf.length) continue;
      const coverPath = join(sourceDir, `${packName}.png`);
      if (existsSync(coverPath)) throw new Error(`封面已存在，拒绝覆盖：${packName}.png`);
      writeFileSync(coverPath, buf);
      created.push(coverPath);
    }

    // 归档源包（不删）
    let archived = [];
    if (archive) {
      const dir = join(sourceDir, ARCHIVE_DIR);
      mkdirSync(dir, { recursive: true });
      for (const name of [basename(zipPath), ...siblingsOf(sourceDir, basename(zipPath))]) {
        const src = join(sourceDir, name);
        if (!existsSync(src)) continue;
        const dst = join(dir, name);
        if (existsSync(dst)) continue; // 同名已归档过，保留旧的
        renameSync(src, dst);
        archived.push(name);
      }
    }

    return { packs: results, archived, ignored, plan };
  } catch (err) {
    // 回滚：本轮建出来的东西全删掉，源包原封不动
    for (const p of created.reverse()) {
      try {
        rmSync(p, { force: true });
      } catch {
        // 删不掉也不掩盖原始错误
      }
    }
    throw err;
  }
}

