// 生成今汐类未匹配确认清单 CSV（可在 Excel 里批注）
import { readFileSync, writeFileSync } from "node:fs";
const r = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-report.json", "utf8"));
const jinxi = r.unmatched.filter((u) => /^今汐/.test(u.name));
const lines = ["迅雷原名（去exe）,迅雷链接,库内同名候选(角色|标题),你的确认(填角色或'新')"];
for (const u of jinxi) {
  lines.push(`${u.name.replace(/\.exe$/i, "")},${u.link},,`);
}
writeFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/jinxi-confirm.csv", "\uFEFF" + lines.join("\n"), "utf8");
console.log(`已写入 ${jinxi.length} 条 → jinxi-confirm.csv`);
