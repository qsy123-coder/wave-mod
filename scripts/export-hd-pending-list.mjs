/**
 * 导出「还需要换高清图」的清单（Markdown + CSV），供手动批量下载 mod 包用。
 *
 * 口径（见 docs/card-preview-sharpness-prd.md 的 Phase 2）：
 *   1. 目标集 = 近 30 天已发布 ∪ 浏览 Top200；
 *   2. 排除已经是 preview-hd 的（Phase 1 做过）；
 *   3. 只保留**横图**（宽高比 >1.1 —— 瀑布流里跨两列的大卡）且宽度 <800 的。
 *      竖图在手机 2 列下约 175 CSS px，560 已经够用，不必重做。
 *
 * 尺寸靠 COS 的 `?imageInfo` 现量（并发 8），不依赖本地缓存。
 *
 * 用法:
 *   node scripts/export-hd-pending-list.mjs                     # 写 docs/hd-preview-pending.{md,csv}
 *   node scripts/export-hd-pending-list.mjs --out=D:/某个目录     # 写到别处（不带扩展名）
 */

import fs from "node:fs";
import https from "node:https";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const SNAPSHOT = resolve(process.cwd(), "data/mods-snapshot.json.gz");
const outArg = process.argv.slice(2).find((a) => a.startsWith("--out="));
const OUT_BASE = outArg
  ? resolve(outArg.slice("--out=".length))
  : resolve(process.cwd(), "docs/hd-preview-pending");

/** 近 30 天窗口：随运行时间滚动的相对口径 */
const RECENT_DAYS = 30;
const RECENT_COUNT_TOP = 200;
const LANDSCAPE_RATIO = 1.1;
/** 竖图 / 大卡的临界宽度：小于它的横图才是真正需要换源的 */
const NEED_WIDTH = 800;

const mods = JSON.parse(gunzipSync(fs.readFileSync(SNAPSHOT)).toString("utf8"));
const cut = new Date(Date.now() - RECENT_DAYS * 864e5);
const recent = mods.filter((m) => new Date(m.created_at) >= cut);
const top = [...mods].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, RECENT_COUNT_TOP);

const seen = new Map();
[...recent, ...top].forEach((m) => seen.set(m.id, m));
const pending = [...seen.values()].filter(
  (m) => !((m.images || [])[0] || "").includes("preview-hd")
);

function imageInfo(url) {
  return new Promise((res) => {
    https
      .get(`${url}?imageInfo`, { rejectUnauthorized: false }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            const i = JSON.parse(d);
            res({ w: Number(i.width), h: Number(i.height) });
          } catch {
            res({ w: 0, h: 0 });
          }
        });
      })
      .on("error", () => res({ w: 0, h: 0 }));
  });
}

const measured = [];
let idx = 0;
async function worker() {
  while (idx < pending.length) {
    const m = pending[idx++];
    const { w, h } = await imageInfo((m.images || [])[0] || "");
    measured.push({ mod: m, w, h, ratio: h > 0 ? w / h : 0 });
    if (measured.length % 50 === 0) console.log(`  量尺寸 ${measured.length}/${pending.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const targets = measured
  .filter((x) => x.ratio > LANDSCAPE_RATIO && x.w > 0 && x.w < NEED_WIDTH)
  .sort((a, b) => a.w - b.w || a.mod.character.localeCompare(b.mod.character));

const linkOf = (mod, platform) =>
  (mod.drive_links || []).find((l) => l.platform === platform)?.url ?? "";

const rows = targets.map(({ mod, w, h }, i) => ({
  no: i + 1,
  character: mod.character,
  title: mod.title,
  size: `${w}x${h}`,
  width: w,
  quark: linkOf(mod, "夸克网盘"),
  xunlei: linkOf(mod, "迅雷网盘"),
  created: String(mod.created_at).slice(0, 10),
  views: mod.views ?? 0,
}));

const md = [
  "# 待换高清预览图的横图清单",
  "",
  `生成时间：${new Date().toISOString().slice(0, 16).replace("T", " ")}（UTC）`,
  "",
  "口径：近 30 天 ∪ 浏览 Top200 里还没换 HD 的 **横图**（宽高比 >1.1，即瀑布流跨两列的大卡），",
  "且当前预览图宽度 <800px。竖图不在其中 —— 手机 2 列下 560 已经够用。",
  "",
  `共 **${rows.length}** 条。下载解压后不用管目录结构，直接跑：`,
  "",
  "```bash",
  "node scripts/rebuild-hd-previews.mjs --src=<解压目录>           # 先 dry-run 看能匹配上哪些",
  "node scripts/rebuild-hd-previews.mjs --src=<解压目录> --apply   # 真正重做",
  "```",
  "",
  "> 解压出来的包结构是 `<mod 名>/Preview.png`，脚本按**图片所在文件夹名**匹配库内标题，",
  "> 所以解压时保持默认的「每个包一个同名文件夹」即可，放在哪个目录都行。",
  "",
  "| # | 角色 | 标题 | 现尺寸 | 创建日 | 夸克 | 迅雷 |",
  "|---|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.no} | ${r.character} | ${r.title} | ${r.size} | ${r.created} | ${r.quark ? "[夸克](" + r.quark + ")" : "—"} | ${r.xunlei ? "[迅雷](" + r.xunlei + ")" : "—"} |`
  ),
  "",
];

const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [
  ["序号", "角色", "标题", "宽", "高", "创建日", "浏览量", "夸克", "迅雷"].join(","),
  ...rows.map((r) =>
    [r.no, r.character, r.title, r.width, r.size.split("x")[1], r.created, r.views, r.quark, r.xunlei]
      .map(csvEscape)
      .join(",")
  ),
  "",
].join("\n");

mkdirSync(dirname(OUT_BASE), { recursive: true });
fs.writeFileSync(`${OUT_BASE}.md`, md.join("\n"), "utf8");
fs.writeFileSync(`${OUT_BASE}.csv`, csv, "utf8");

console.log(`\n待办总数 ${pending.length} 条 → 横图 <${NEED_WIDTH}px 的 ${rows.length} 条`);
console.log(`✅ 已写出 ${OUT_BASE}.md`);
console.log(`✅ 已写出 ${OUT_BASE}.csv`);
