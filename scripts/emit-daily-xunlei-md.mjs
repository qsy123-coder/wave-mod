/**
 * 把 apply-daily-xunlei-by-date.mjs 的匹配报告追加进「每日mod迅雷链接明细.md」。
 *
 * 数据源：daily-xunlei-910-919-report.json（含 toWrite 已写入 + already 已含迅雷两部分，
 *   两者都是「分享名 ↔ 库内 mod ↔ 迅雷链接」的完整对应，合起来就是要补进文档的全量行）。
 *
 * 行为：
 *   1. 按 日期 → 文件名 排序生成表格行，追加到 md 末尾（既有 9.4~9.9 的行保持不动）；
 *   2. 同步更新表头里「本表共 **N** 条」的计数。
 *
 * 用法：node scripts/emit-daily-xunlei-md.mjs            # dry-run，只打印将追加的行
 *      node scripts/emit-daily-xunlei-md.mjs --apply    # 写文件
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT = "D:/BaiduNetdiskDownload/WaveMod";
const cliArgs = process.argv.slice(2);
const argValue = (name) => {
  const hit = cliArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
};

const REPORT = argValue("report") ||
  "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-xunlei-910-919-report.json";
const MD_PATH = resolve(PROJECT, "每日mod迅雷链接明细.md");
const isApply = cliArgs.includes("--apply");

if (!existsSync(REPORT)) {
  console.error(`❌ 未找到 ${REPORT}\n   请先运行 scripts/apply-daily-xunlei-by-date.mjs`);
  process.exit(1);
}

const { toWrite = [], already = [] } = JSON.parse(readFileSync(REPORT, "utf8"));
const entries = [...toWrite, ...already];

const dayNum = (day) => {
  const m = /^W-(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(day);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
};
entries.sort((a, b) => dayNum(a.day) - dayNum(b.day) || a.name.localeCompare(b.name, "zh-CN"));

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|") || "-";
const rows = entries.map((e) => {
  const file = e.name.replace(/\.exe$/i, "");
  return `| ${e.day} | ${cell(file)} | ${cell(e.title)} | ${cell(e.character)} | ${cell(e.link)} | ${cell(e.pwd)} |`;
});

const md = readFileSync(MD_PATH, "utf8");
console.log(`📄 ${MD_PATH}`);
console.log(`   报告条目: ${entries.length}（toWrite ${toWrite.length} + already ${already.length}）`);
console.log("\n===== 将追加 =====");
for (const r of rows) console.log(r);

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未写文件。确认后加 --apply。");
  process.exit(0);
}

const countRe = /> 本表共 \*\*(\d+)\*\* 条/;
const m = countRe.exec(md);
if (!m) {
  console.error("❌ 表头未找到「本表共 **N** 条」，请检查文档格式");
  process.exit(1);
}

// 表格行要插在**最后一行表格之后**，而不是文件末尾——后面还有 `---` + 「## 说明」段落。
const lines = md.split("\n");
let lastRow = -1;
for (let i = 0; i < lines.length; i++) if (/^\|\s*W-\d{4}\.\d+\.\d+\s*\|/.test(lines[i])) lastRow = i;
if (lastRow === -1) {
  console.error("❌ 表格中未找到任何数据行，请检查文档格式");
  process.exit(1);
}
lines.splice(lastRow + 1, 0, ...rows);
const nextMd = lines.join("\n").replace(countRe, `> 本表共 **${Number(m[1]) + rows.length}** 条`);
writeFileSync(MD_PATH, nextMd, "utf8");
console.log(`\n✅ 已插入 ${rows.length} 行（表格第 ${lastRow + 1} 行之后），计数 ${m[1]} → ${Number(m[1]) + rows.length}`);
