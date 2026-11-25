/**
 * 检查某个目录里「预览图会不会挂到主条目上」。
 *
 * 直接复用命名工坊的 buildRows：附件名带版本号时，图片必须仍能归到主包，
 * 否则会掉进孤儿组单独起名（版本号就从图片名里消失了）。
 *
 * 用法：node tools/wuwa_mod_crawl/local/check-image-attach.mjs "<目录>"
 */
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const { buildRows } = await import(pathToFileURL(resolve(root, "tools/mod-rename/lib/scan.mjs")).href);

const MOD_EXTS = new Set([".zip", ".7z", ".rar", ".exe"]);
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const dir = process.argv[2];
if (!dir) {
  console.error('用法：node ... "<目录>"');
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
for (const r of rows) {
  const imgs = r.images ?? [];
  const flag = r.kind === "image" ? "孤儿图组" : imgs.length ? "OK" : "无图";
  console.log(`[${flag}] ${r.name}  images=${imgs.length}`);
  if (r.kind === "image" || !imgs.length) continue;
  for (const i of imgs) console.log(`      - ${i}`);
}
