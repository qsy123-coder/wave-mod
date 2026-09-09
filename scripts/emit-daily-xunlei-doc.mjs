/**
 * 生成「每日mod迅雷链接明细」文档，供人工核对。
 * 数据源：daily-apply.json（apply-daily-xunlei 生成）→ 读最终 toWrite 清单。
 * 输出：D:/BaiduNetdiskDownload/WaveMod/每日mod迅雷链接明细.md
 */
import { readFileSync, writeFileSync } from "node:fs";

const REPORT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-apply.json";
const OUT = "D:/BaiduNetdiskDownload/WaveMod/每日mod迅雷链接明细.md";

const data = JSON.parse(readFileSync(REPORT, "utf8"));
const items = data.toWrite; // 45 条待写
// 重新拉取 daily-final 拿 dir + 便于排序
const final = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-final.json", "utf8"));
const dirByMod = new Map();
for (const r of final) if (r.modId) dirByMod.set(r.modId, r.dir);
// 暮星在 manual，不在 final 里，单独补 dir
const manualDir = { "ca242430-ed21-4493-82bf-63bb810cd6eb": "W-2026.9.5" };

const ordered = [...items].sort((a, b) => {
  const da = dirByMod.get(a.modId) || manualDir[a.modId] || "";
  const db = dirByMod.get(b.modId) || manualDir[b.modId] || "";
  return da.localeCompare(db) || (a.title || "").localeCompare(b.title || "");
});

const lines = [];
lines.push("# 每日 mod 迅雷网盘链接明细\n");
lines.push(`> 数据源：A_每日更新 各日期文件夹内的「分享结果导出-*.xlsx」（迅雷网盘分享记录）。`);
lines.push(`> 本表共 **${ordered.length}** 条，对应每日上传的 mod，全部精确命中。\n`);
lines.push("| 日期 | 文件名 | 库内标题 | 角色 | 迅雷链接 | 提取码 |");
lines.push("|---|---|---|---|---|---|");
for (const it of ordered) {
  const date = dirByMod.get(it.modId) || manualDir[it.modId] || "";
  const linkNoTrail = (it.link || "").replace(/#$/, "");
  const title = it.title === undefined ? "暮星" : it.title;
  const fname = it.filename === undefined ? "清宵-暮星" : it.filename;
  lines.push(`| ${date} | ${fname} | ${title} | ${it.character || "-"} | ${linkNoTrail} | ${it.link ? (it.link.match(/pwd=(\w+)/)?.[1] || "") : ""} |`);
}
lines.push("\n---\n");
lines.push("## 说明");
lines.push("- 每个 mod 均从「该日期文件夹」内的迅雷分享导出中精确匹配（grade=exact），非跨角色同名猜测。");
lines.push("- 写库时会在每个 mod 的 `drive_links` **追加** `{ platform:'迅雷网盘', url }`，**保留原有夸克链接**。");
lines.push("- 幂等：若某 mod 已有迅雷链接则跳过。");
lines.push("- `暮星`（清宵）已人工确认为库内 `暮星`/清宵，入库时手动补齐。");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`📄 已写入: ${OUT} (${ordered.length} 条)`);
