import { readFileSync } from "node:fs";
let raw = readFileSync("C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-full.json", "utf8");
raw = raw.replace(/^\uFEFF/, "");
const all = JSON.parse(raw);
console.log("total records:", all.length);

// 6 个待查 mod 的关键词组（含变体）
const groups = {
  "小爱居家服": ["居家服","小爱","居家","pajama","睡衣","小爱居家","爱弥斯-小爱"],
  "早乙女优华": ["早乙","优华","乙女","由华","柚华","丹瑾-早"],
  "滑翔翼-蓝色蝴蝶": ["蓝色蝴蝶","蓝蝴蝶","蝴蝶","蓝色","滑翔","翱翔"],
  "嘉贝莉娜-堕天使": ["堕天使","嘉贝莉娜-堕","天使 by Caver","嘉贝莉娜-堕天"],
  "吟霖-脱衣舞娘": ["脱衣","舞娘","吟霖"],
  "尤诺-绛雨-雨洗双锋": ["绛雨","雨洗","双锋","绛","绛雨-"],
};
for (const [mod, keys] of Object.entries(groups)) {
  console.log(`\n===== ${mod} =====`);
  const seen = new Set();
  for (const k of keys) {
    for (const r of all) {
      if ((r.name||"").includes(k)) {
        const kk = r.name+"|"+r.link;
        if (seen.has(kk)) continue; seen.add(kk);
        console.log(`  ${r.name} → ${r.link} ${r.pwd?("pwd="+r.pwd):""}`);
      }
    }
  }
  if (seen.size === 0) console.log("  ❌ 无任何匹配");
}
