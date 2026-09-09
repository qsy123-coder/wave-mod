import { readFileSync } from "node:fs";
const map = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json", "utf8"));
const daily = JSON.parse(readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-xunlei.json", "utf8"));
const all = [...map.map((r) => ({ ...r, src: "bulk" })), ...daily.map((r) => ({ ...r, src: "daily" }))];

const groups = {
  "小爱居家服": ["居家服","小爱","居家","pajama","睡衣"],
  "早乙女优华": ["早乙","优华","乙女","由华","柚华"],
  "滑翔翼-蓝色蝴蝶": ["蓝色蝴蝶","蝴蝶","滑翔","翱翔","蓝色"],
  "嘉贝莉娜-堕天使": ["堕天使","天使","堕落","嘉贝莉娜"],
  "吟霖-脱衣舞娘": ["脱衣","舞娘","吟霖"],
  "尤诺-绛雨-雨洗双锋": ["绛雨","雨洗","双锋","绛"],
};
for (const [mod, keys] of Object.entries(groups)) {
  console.log(`\n===== ${mod} =====`);
  const seen = new Set();
  for (const k of keys) {
    const hits = all.filter((r) => (r.name || "").includes(k));
    for (const h of hits) {
      const kk = h.name+'|'+h.link;
      if (seen.has(kk)) continue; seen.add(kk);
      console.log(`  [${h.src}] ${h.name} → ${h.link} ${h.pwd ? `pwd=${h.pwd}`:""}`);
    }
  }
  if (seen.size === 0) console.log("  ❌ 无任何匹配");
}
