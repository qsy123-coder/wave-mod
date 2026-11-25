/**
 * 从下载队列（state.gb_downloads.json）给某个日期目录预生成 `.mod-groups.json`。
 *
 * 目的：同一 GameBanana 帖子的多个附件，上传时要合并成一张卡（卡片里选版本）。
 * 正常链路是「命名工坊改名 → 写清单」，但如果不走工坊（手工改名/直接打包），
 * 清单就不会生成，上传脚本只能逐条入库 → 同一 mod 冒出多张卡。
 *
 * 本脚本按 `mod_id` 把当天落盘的附件聚成组；改名之后再跑一次也无害：
 * 命名工坊的 merge 按 `sourceName`（原始附件名）对齐，会覆盖 name/localName。
 *
 * 用法：
 *   node tools/wuwa_mod_crawl/local/build-mod-groups-from-state.mjs --day=2026-11-25
 *   node tools/wuwa_mod_crawl/local/build-mod-groups-from-state.mjs --day=2026-11-25 --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const load = (p) => import(pathToFileURL(resolve(root, p)).href);

const { deriveVariantLabel, uniqueVariantLabel } = await load("scripts/mod-groups-pure.mjs");
const { buildModGroupsFileContent, modGroupsPath, writeModGroupsFileAtomic, readModGroupsFile } = await load(
  "scripts/mod-groups.mjs"
);

const arg = (name) => {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((a) => a.startsWith(prefix))?.slice(prefix.length);
};
const apply = process.argv.includes("--apply");

const BASE =
  process.env.WAVE_MOD_DAILY_BASE?.trim() ||
  String.raw`F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;
const STATE_PATH = join(root, "tools/wuwa_mod_crawl/state.gb_downloads.json");

const day = (arg("--day") || "").trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error("用法：--day=YYYY-MM-DD [--apply]");
  process.exit(1);
}
const [y, m, d] = day.split("-").map(Number);
const dateDir = join(BASE, `W-${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`);
if (!existsSync(dateDir)) {
  console.error(`日期目录不存在：${dateDir}`);
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
const items = state?.items ?? {};

/** 附件是否落在当天来源目录（不在「更新」子目录里 —— 更新包不新开卡） */
const livesInDayDir = (item, fileName) => {
  const source = "GameBanana";
  return existsSync(join(dateDir, source, fileName));
};

const incoming = [];
for (const [modId, item] of Object.entries(items)) {
  if (String(item.day ?? "") !== day) continue;
  if (String(item.status ?? "") !== "done") continue;
  const files = (item.files ?? []).filter((f) => f?.file && livesInDayDir(item, f.file));
  if (files.length < 2) continue;
  const title = String(item.name ?? "").trim();
  const used = new Set();
  const variants = files.map((f, index) => {
    const stem = String(f.file).replace(/\.[^.]+$/, "");
    return {
      label: uniqueVariantLabel(deriveVariantLabel(f.src || f.file, title), used),
      name: stem,
      localName: String(f.file),
      sourceName: String(f.src ?? ""),
      isBase: index === 0 || /base|main/i.test(`${f.src ?? ""} ${f.version ?? ""}`),
    };
  });
  incoming.push({ postUrl: item.page_url || `https://gamebanana.com/mods/${modId}`, variants });
  console.log(`[组] ${title} (${modId}) → ${variants.length} 个变体`);
  for (const v of variants) console.log(`     ${v.isBase ? "*" : " "} ${v.label}  name="${v.name}"  src="${v.sourceName}"`);
}

if (!incoming.length) {
  console.log("没有需要合并的帖子（当天没有多附件的 mod）。");
  process.exit(0);
}

const path = modGroupsPath(dateDir);
const content = buildModGroupsFileContent(readModGroupsFile(dateDir), incoming);
if (!content) {
  console.log("合并后没有有效分组，不写文件。");
  process.exit(0);
}

const groups = Object.keys(JSON.parse(content).groups ?? {});
console.log(`\n将写入 ${path}（${groups.length} 个组）`);
if (!apply) {
  console.log("DRY-RUN。加 --apply 落盘。");
  process.exit(0);
}
writeModGroupsFileAtomic(path, content);
console.log("已写入。");
