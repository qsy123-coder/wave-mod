/**
 * 把一个目录里的预览图改成与主条目（exe/压缩包）同名。
 *
 * 2026-11-25：附件名带上版本号后，图片一度被当成孤儿单独改名，结果
 * `X_1 by 作者.jpg` 与 `X v0.9 by 作者.exe` 不同名。命名工坊的匹配已经修好，
 * 这个脚本用于把已经改错的那批一次性纠回来（不用重跑整轮改名）。
 *
 * 用法：
 *   node tools/wuwa_mod_crawl/local/rename-previews-to-primary.mjs "<目录>"
 *   node tools/wuwa_mod_crawl/local/rename-previews-to-primary.mjs "<目录>" --apply
 */
import { readdirSync, renameSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const { buildRows } = await import(pathToFileURL(resolve(root, "tools/mod-rename/lib/scan.mjs")).href);

const MOD_EXTS = new Set([".zip", ".7z", ".rar", ".exe"]);
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir) {
  console.error('用法：node ... "<目录>" [--apply]');
  process.exit(1);
}

const entries = readdirSync(dir, { withFileTypes: true })
  .filter((e) => !e.name.startsWith("."))
  .map((e) => {
    const full = join(dir, e.name);
    const isDir = e.isDirectory();
    const ext = isDir ? "" : extname(e.name).toLowerCase();
    const kind = isDir ? "dir" : MOD_EXTS.has(ext) ? "mod" : IMG_EXTS.has(ext) ? "image" : "other";
    return { name: e.name, base: isDir ? e.name : basename(e.name, ext), kind, ext, isDir, size: isDir ? 0 : statSync(full).size };
  })
  .filter((e) => e.kind !== "other");

const rows = buildRows(entries);
const moves = [];
for (const row of rows) {
  if (row.kind === "image") continue;
  const images = row.images ?? [];
  images.forEach((name, i) => {
    const ext = extname(name);
    const to = `${row.base}${i === 0 ? "" : `-${i}`}${ext}`;
    if (name !== to) moves.push({ from: name, to, owner: row.name });
  });
}

if (!moves.length) {
  console.log("所有预览图已与主条目同名，无需处理。");
  process.exit(0);
}

for (const m of moves) {
  const src = join(dir, m.from);
  const dst = join(dir, m.to);
  const exists = readdirSync(dir).includes(m.to);
  console.log(`${m.from}\n  -> ${m.to}${exists ? "   ⚠️ 目标已存在" : ""}`);
  if (!apply) continue;
  if (exists) {
    console.log("   跳过（目标已存在）");
    continue;
  }
  renameSync(src, dst);
}

console.log(`\n共 ${moves.length} 张；${apply ? "已改名" : "DRY-RUN（加 --apply 执行）"}`);
