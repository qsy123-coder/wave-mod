/**
 * 重新生成「迅雷网盘缺失清单.md」。
 * 数据源：库内 game_key=wuthering-waves 且 drive_links 不含「迅雷网盘」的 mod。
 * 角色聚合 + 明细 + 今日已完成（所有已补链接）。纯读库，不写库。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const OUT = "D:/BaiduNetdiskDownload/WaveMod/迅雷网盘缺失清单.md";
const TODAY = "2026-09-09";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 归一：把库内角色变体映射回标准分类（与前端 CHARACTER_ALIASES 一致）
const ALIASES = {
  "陆赫斯": "路赫斯",
  "反虚化，ui界面，场景，葫芦，特效等": "UI",
  "千咲皮肤[蜜桃冰]": "千咲",
  "科考摩托": "滑翔翼,翱翔翼,科考摩托",
};
const normChar = (c) => ALIASES[(c || "").trim()] || (c || "").trim();

const hasXl = (links) => Array.isArray(links) && links.some((d) => String(d.platform || "").includes("迅雷"));

const db = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data, error } = await supabase.from("mods")
    .select("id, title, character, drive_links, created_at")
    .eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (error) { console.error("❌", error.message); process.exit(1); }
  if (!data || !data.length) break;
  db.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
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

// 角色顺序：清宵、UI、爱弥斯、穗穗、女漂... 用出现过的固定顺序更友好，这里按数量倒序即可
const lines = [];
lines.push("# 迅雷网盘缺失链接清单\n");
lines.push(`> 更新：${TODAY}（本日补入 45 条每日更新 + 12 条旧版本迅雷链接 + 5 条违规改名重传；缺失 63 → 1）`);
lines.push(`> 范围：WaveMod 库内 \`game_key = wuthering-waves\` 且 \`drive_links\` 中**不含**「迅雷网盘」的 mod。`);
lines.push(`> 库内 mod 总数：**${total}** ｜ 已有迅雷链接：**${has}** ｜ **缺失：${missing.length}**\n`);
lines.push("---\n");
lines.push("## 按角色汇总\n");
lines.push("| 角色 | 缺失数 |");
lines.push("| --- | --- |");
for (const [c, arr] of order) lines.push(`| ${c} | ${arr.length} |`);
lines.push("\n---\n");
lines.push("## 完整明细\n");
lines.push("> 格式：`[角色] 标题`\n");

for (const [c, arr] of order) {
  lines.push(`### ${c}（${arr.length}）\n`);
  const sorted = [...arr].sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const t of sorted) lines.push(`- [${c}] ${t || "(空白标题)"}`);
  lines.push("");
}

lines.push("---\n");
lines.push("## 今日已完成\n");
lines.push("1. **补入 45 条每日更新迅雷链接**（`A_每日更新` 各日期文件夹的 `分享结果导出-*.xlsx`，均精确命中）。");
lines.push("2. **补入 12 条旧版本迅雷链接**（批量导出命中）：Starlight Fox、Thicc Aemeath、渊武-重奏、露西-编队图片-动画、女漂-渡鸦礼服、武器-HK416、清宵-曲线优美、极霸剑×2（清宵背后剑 / 清宵专武）、坎特蕾拉/卡提希娅/菲比全ui-动态nsfw。");
lines.push("3. **修正 2 个错误角色分类**：`千咲皮肤[蜜桃冰]` → `千咲`；`科考摩托` → `滑翔翼,翱翔翼,科考摩托`。");
lines.push("4. **修正 5 条丢失角色前缀的 UI 标题**：`全ui-动态nsfw-v*` → `{角色}全ui-动态nsfw-v*`（露帕、男女漂、卡提希娅、菲比、坎特蕾拉）。");
lines.push("5. 缺迅雷总数由 **63 → 6**。");
lines.push("6. **补入 5 条违规改名重传的迅雷链接**（原 NSFW 标题被迅雷判违规，重传为规避词：");
lines.push("   `早乙女优华→早已楠优化`、`脱衣舞娘→托伊舞娘`、`堕天使→惰天师`、`绛雨/雨洗双锋→降雨/雨溪双风`、`蓝色蝴蝶→兰瑟胡蝶`），");
lines.push("   已从 `Desktop\\违规\\分享结果导出-1788960803031.xlsx` 解析并写入库。");
lines.push("7. 缺迅雷总数进一步由 **6 → 1**。\n");
lines.push("## 待确认 / 说明\n");
lines.push("1. **仅剩 1 条**：`爱弥斯-小爱居家服`（`小爱居家服 Aemeath pajamas NSFW`，角色 `爱弥斯`）在全部 64 份迅雷导出中均无分享记录，且当前库内仅挂「百度网盘 + 夸克网盘」。因其原名未被迅雷判违规、未进入 `Desktop\\违规` 重传批次，故仍无迅雷链接。需人工在迅雷网盘提供对应分享链接，或确认其仅存在于百度/夸克。");
lines.push("2. `极霸剑` 两条的分配（清宵→背后的剑，武器→专武）与 `武器-HK416`（地图实为 `琳奈专武` 前缀）是基于标题正文的推断，如需调整请告知。");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`📄 已写入: ${OUT}`);
console.log(`   总数 ${total} | 有迅雷 ${has} | 缺 ${missing.length}`);
console.log("\n===== 缺失明细（按角色） =====");
for (const [c, arr] of order) console.log(`  [${c}] ${arr.length}`);
