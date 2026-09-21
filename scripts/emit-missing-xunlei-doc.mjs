/**
 * 重新生成「迅雷网盘缺失清单.md」。
 * 数据源：库内 game_key=wuthering-waves 且 drive_links 不含「迅雷网盘」的 mod。
 * 纯读库，不写库。
 *
 * 文件分两段，职责分离：
 *   1. 数据段（本脚本生成）：表头统计 + 按角色汇总 + 完整明细。
 *   2. 人工段（本脚本**原样保留**）：从 MANUAL_MARKER 起往下的补录记录 / 说明。
 * 早期版本把「更新日期 + 今日已完成 + 待确认」也写死在脚本里，结果 2026-09-09 那轮的
 * 文案会在每次重跑时覆盖人工维护的记录（还会把已补齐的条目重新写成"仍缺"），
 * 故改为只认标记、以下不动。
 *
 * 用法：
 *   node scripts/emit-missing-xunlei-doc.mjs           # dry-run，写 xxx.preview.md
 *   node scripts/emit-missing-xunlei-doc.mjs --apply    # 覆盖正式文档
 *
 * 走 psql 直连（不是 supabase-js），所以 REST 网关被配额锁死时也能生成。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const OUT = "D:/BaiduNetdiskDownload/WaveMod/迅雷网盘缺失清单.md";

/** dry-run 时写这里，绝不动 OUT —— OUT 里有人工逐次维护的叙述段落 */
const PREVIEW = "D:/BaiduNetdiskDownload/WaveMod/迅雷网盘缺失清单.preview.md";

/**
 * 人工段的边界标记。此段（含）以下内容脚本原样保留、不重写；
 * 要记补录就打开文档往这段里加，不需要动脚本。
 */
const MANUAL_MARKER = "<!-- 以下为人工维护段落（补录记录 / 说明），脚本不改写 -->";

// 站点口径统一用上海时区（与上传脚本、备份脚本一致）
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const cliArgs = process.argv.slice(2);
const isApply = cliArgs.includes("--apply");

// 直连 Postgres(5432) 而不是 supabase-js：超出口配额时 REST 网关一律回
// 402(exceed_egress_quota)，这条链路不受影响。实现见 scripts/psql-db.mjs。
requireDatabaseUrl();

// 归一：把库内角色变体映射回标准分类（与前端 CHARACTER_ALIASES 一致）
const ALIASES = {
  "陆赫斯": "路赫斯",
  "反虚化，ui界面，场景，葫芦，特效等": "UI",
  "千咲皮肤[蜜桃冰]": "千咲",
  "科考摩托": "滑翔翼,翱翔翼,科考摩托",
};
const normChar = (c) => ALIASES[(c || "").trim()] || (c || "").trim();

const hasXl = (links) => Array.isArray(links) && links.some((d) => String(d.platform || "").includes("迅雷"));

/**
 * 从既有文档里切出人工段。没有可识别的人工段时返回 null。
 * 标记是 2026-09-21 引入的，此前的文档以「## 补录记录 / ## 今日已完成」开头，
 * 这里一并兼容，并顺手补上标记，下一次就按标记识别。
 */
function extractManualSection(existing) {
  if (!existing) return null;
  const at = existing.indexOf(MANUAL_MARKER);
  if (at >= 0) return existing.slice(at);
  const legacy = /^##[ \t]*(补录记录|今日已完成)[ \t]*$/m.exec(existing);
  if (legacy) return `${MANUAL_MARKER}\n${existing.slice(legacy.index)}`;
  return null;
}

// 一次取回全表（当前约 5200 行）。结果由 psql -o 落盘再读回，不走 stdout——
// 多字节中文在 stdout 上会被切在 chunk 边界，静默乱码。
const db = await psqlJson(`
select coalesce(json_agg(json_build_object(
  'id', id,
  'title', title,
  'character', character,
  'drive_links', drive_links,
  'created_at', created_at
)), '[]'::json)::text
from mods
where game_key = ${dollarQuote(GAME_KEY)};
`);

if (!Array.isArray(db)) {
  console.error("❌ 查询失败：psql 未返回数组");
  process.exit(1);
}

const total = db.length;
const missing = db.filter((m) => !hasXl(m.drive_links));
const has = total - missing.length;

// 按角色聚合
const byChar = new Map();
for (const m of missing) {
  const c = normChar(m.character);
  if (!byChar.has(c)) byChar.set(c, []);
  byChar.get(c).push(m.title);
}
const order = [...byChar.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"));

// 人工段：先读旧文档再决定能不能覆盖。文件存在却认不出人工段时，覆盖等于删记录 —— 中止。
const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
const manual = extractManualSection(existing);
if (isApply && existing && !manual) {
  console.error(`❌ ${OUT} 已存在，但认不出人工维护段（既无标记也无「## 补录记录」标题）。`);
  console.error("   覆盖会连人工记录一起删掉，已中止。确认无误就手工加一行：");
  console.error(`   ${MANUAL_MARKER}`);
  process.exit(1);
}

const lines = [];
lines.push("# 迅雷网盘缺失链接清单\n");
lines.push(`> 更新：${TODAY}（脚本重生成：总数 **${total}** ｜ 已有迅雷 **${has}** ｜ **缺失 ${missing.length}**）`);
lines.push(`> 范围：WaveMod 库内 \`game_key = wuthering-waves\` 且 \`drive_links\` 中**不含**「迅雷网盘」的 mod。\n`);
lines.push("---\n");
lines.push("## 按角色汇总\n");
lines.push("| 角色 | 缺失数 |");
lines.push("| --- | --- |");
if (order.length === 0) lines.push("| （无） | 0 |");
for (const [c, arr] of order) lines.push(`| ${c} | ${arr.length} |`);
lines.push("\n---\n");
lines.push("## 完整明细\n");
lines.push("> 格式：`[角色] 标题`\n");

if (order.length === 0) {
  lines.push("（无缺失项：全库 mod 均已挂迅雷链接）\n");
}
for (const [c, arr] of order) {
  lines.push(`### ${c}（${arr.length}）\n`);
  const sorted = [...arr].sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const t of sorted) lines.push(`- [${c}] ${t || "(空白标题)"}`);
  lines.push("");
}

if (manual) {
  // 这里只补一个空元素：上面的元素自身多以 \n 结尾，再多推一个会连出两个空行
  lines.push("---", "", manual.trimEnd());
}

const target = isApply ? OUT : PREVIEW;
const text = lines.join("\n");
writeFileSync(target, text.endsWith("\n") ? text : `${text}\n`, "utf8");
console.log(`📄 已写入: ${target}`);
if (!isApply) {
  console.log("🔍 DRY-RUN：写的是 preview 文件，正式文档未改动。核对后加 --apply。");
}
console.log(`   总数 ${total} | 有迅雷 ${has} | 缺 ${missing.length}`);
console.log(`   人工段：${manual ? `已保留 ${manual.split("\n").length} 行` : "（旧文档里没有，生成的是纯数据段）"}`);
console.log("===== 缺失明细（按角色） =====");
for (const [c, arr] of order) console.log(`  [${c}] ${arr.length}`);
