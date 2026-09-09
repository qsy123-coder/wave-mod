/**
 * 重写匹配：字符感知 + 核心标题 token 模糊。
 * 逐每日 exe 文件：
 *   1. 用 CHARACTER_PREFIXES 找出该文件对应的角色（含异体字），剥离角色前缀。
 *   2. 只剩 wMOD 名：去版本号 / 括号内容 / 作者 / 装饰词（皮肤、全ui 等包装前缀）。
 *   3. 在 xunlei-map 里 ONLY 看同角色的记录（容忍异体字），再按「核心标题 token 重合度」打分。
 * 避免跨角色同名误配（如 穗穗-夜魅 vs 洛瑟菈-暗夜魅影）。
 * 输出：逐文件 Top 候选 + score，供人工确认；只报告，不改库。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "D:/BaiduNetdiskDownload/MC-MOD整合包/wMOD全集-每日更新/A_每日更新";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/daily-match-v2.json";

// 角色枚举（含库内已用异体字）——从每日文件名/库内出现的字符。
const CHAR_ALIASES = {
  "洛瑟菈": ["洛瑟菈", "洛瑟拉", "洛瑟菈"],
  "清宵": ["清宵", "清霄", "清宵"],
  "爱弥斯": ["爱弥斯", "爱弥丝", "爱弥斯"],
  "科考摩托": ["科考摩托", "科考摩托"],
  "穗穗": ["穗穗"],
  "卡提希娅": ["卡提希娅", "卡提西娅", "卡提希娅"],
  "琳奈皮肤": ["琳奈皮肤", "琳奈"],
  "釉瑚": ["釉瑚", "釉瑚"],
  "露帕全ui": ["露帕全ui", "露帕"],
  "女漂皮肤": ["女漂皮肤", "女漂"],
  "女漂": ["女漂", "女主", "女主角"],
  "尤诺": ["尤诺"],
  "索拉指南": ["索拉指南", "索拉"],
  "丹瑾": ["丹瑾"],
  "奥古斯塔": ["奥古斯塔"],
  "玄翎": ["玄翎"],
  "千咲皮肤": ["千咲皮肤", "千咲"],
  "千咲": ["千咲"],
  "莫宁": ["莫宁"],
  "男女漂全ui": ["男女漂全ui", "男女漂"],
  "武器": ["武器", "专武", "科考摩托"],
};
// 库内实际 character 用规范名（每日文件名 → 库 character）
const CHAR_CANON = {
  "洛瑟菈": "洛瑟菈", "清宵": "清宵", "爱弥斯": "爱弥斯", "科考摩托": "科考摩托",
  "穗穗": "穗穗", "卡提希娅": "卡提希娅", "琳奈皮肤": "琳奈皮肤", "釉瑚": "釉瑚",
  "露帕全ui": "UI", "女漂皮肤": "女漂", "女漂": "女漂", "尤诺": "尤诺",
  "索拉指南": "索拉指南", "奥古斯塔": "奥古斯塔", "玄翎": "玄翎",
  "千咲皮肤": "千咲", "千咲": "千咲", "莫宁": "莫宁", "男女漂全ui": "UI", "丹瑾": "丹瑾",
};

const map = JSON.parse(readFileSync(MAP_PATH, "utf8")).filter((r) => r.link && r.link.startsWith("http"));
for (const r of map) r._name = r.name.replace(/\.exe$/i, "").trim();

// 包装前缀 / 装饰词（皮肤、全ui、动态、nsfw 等）从标题剥离
const WRAP = /^(皮肤|全ui|全UI|男女漂全ui|男女漂|动态nsfw|动态|nsfw|完整版|完整|内附|上下左右|v\d+\.\d+\.?\d*)/i;
// 版本号
const VERSION = /\bv?\d+(\.\d+)*\s*(\([^)]*\)|（[^）]*）)?/g;

function findChar(raw) {
  // 找最长的角色前缀
  for (const key of Object.keys(CHAR_ALIASES)) {
    for (const alias of CHAR_ALIASES[key]) {
      if (raw.startsWith(alias)) return { group: key, canon: CHAR_CANON[key] || key };
    }
  }
  return null;
}

// 从 xunlei 名剥离指定角色前缀（容忍异体字）
function stripChar(raw, group) {
  for (const alias of (CHAR_ALIASES[group] || [])) {
    if (raw.startsWith(alias)) {
      let rest = raw.slice(alias.length);
      rest = rest.replace(/^[（(\[]/, "").replace(/^[（(\[【].*?[)）\]]/, "").replace(/^[\s\-—－:：,，.。]+/, "");
      return rest;
    }
  }
  return null;
}

// 核心 token：去版本 / 括号 / 作者 / 包装前缀，只留中文/字母数字块
function coreTokens(s) {
  if (!s) return [];
  let t = s
    .replace(/[（(【\[].*?[)）】\]]/g, "") // 括号内容全清
    .replace(/by\s+[\w\u4e00-\u9fff]+/ig, "") // 作者
    .replace(VERSION, "");
  // 逐字符剥离包装前缀
  let prev;
  do { prev = t; t = t.replace(WRAP, ""); } while (t !== prev);
  t = t.replace(/^[\s\-—－:：,，.。·]+/, "").replace(/[\s\-—－:：,，.。·]+$/g, "");
  // 切成 token（按非中文字符分隔，但保留中文字符串 + 英文数字串）
  const tokens = [];
  const re = /[\u4e00-\u9fff]+|[a-zA-Z0-9]+/g;
  let m;
  while ((m = re.exec(t))) tokens.push(m[0].toLowerCase());
  return tokens;
}

// 相似度：token 词袋 Jaccard + 精炼（含 星紫/午夜 这类实词全含即高分）
function score(t1, t2) {
  const a = [...new Set(t1)], b = [...new Set(t2)];
  if (!a.length || !b.length) return 0;
  let inter = 0;
  for (const x of a) if (b.includes(x)) inter++;
  const union = a.length + b.length - inter;
  const jac = inter / union;
  // 若 xunlei token 全被每日 token 覆盖 或 vice versa，加分
  const covered = (a.includes && a.length && a.every((x) => b.includes(x))) || b.every((x) => a.includes(x));
  return { jac: +jac.toFixed(3), inter, a: a.length, b: b.length, covered };
}

const files = [];
for (const d of readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || !/^W-/.test(d.name)) continue;
  for (const f of readdirSync(join(BASE, d.name))) {
    if (!f.endsWith(".exe")) continue;
    files.push({ name: f.replace(/\.exe$/i, "").trim(), dir: d.name });
  }
}

const results = [];
for (const f of files) {
  const ch = findChar(f.name);
  const dailyTokens = coreTokens(f.name);
  const cands = [];
  if (ch) {
    for (const r of map) {
      const stripped = stripChar(r._name, ch.group);
      if (stripped === null) continue; // 只认同角色
      const xt = coreTokens(stripped);
      const s = score(dailyTokens, xt);
      if (s.jac >= 0.34) {
        let pts = s.jac * 100;
        if (s.covered) pts += 20;
        if (s.inter >= 1) pts += 12;
        cands.push({ xunleiName: r._name, link: r.link, pwd: r.pwd, jac: s.jac, inter: s.inter, covered: s.covered, pts: Math.round(pts) });
      }
    }
  } else {
    // 无法识别角色：跨角色全图核心 token (降级)
  }
  cands.sort((a, b) => b.pts - a.pts || b.jac - a.jac);
  results.push({ dir: f.dir, name: f.name, char: ch ? ch.canon : null, dailyTokens, cands: cands.slice(0, 6) });
}

const withCand = results.filter((r) => r.cands.length > 0).sort((a, b) => b.cands[0].pts - a.cands[0].pts);
const noCand = results.filter((r) => r.cands.length === 0);

writeFileSync(REPORT_PATH, JSON.stringify({ withCand, noCand: noCand.map((r) => ({ dir: r.dir, name: r.name, char: r.char })) }, null, 2), "utf8");

console.log(`📥 每日文件 ${files.length} | xunlei ${map.length} | 有候选 ${withCand.length} | 无候选 ${noCand.length}\n`);

console.log("===== 🎯 有候选（降序） =====");
for (const r of withCand) {
  console.log(`[${r.dir}] ${r.name}`);
  console.log(`   char=角色(group) | 候选 ${r.cands.length}`);
  r.cands.slice(0, 4).forEach((c) => console.log(`   ⭐${c.pts} jac=${c.jac} inter=${c.inter}${c.covered ? " [covered]" : ""} | ${c.xunleiName}`));
  console.log("");
}

console.log(`===== ❌ 无候选（${noCand.length}） =====`);
for (const r of noCand) console.log(`[${r.dir}] ${r.name}  (char=${r.char})`);

console.log(`\n📄 报告: ${REPORT_PATH}`);
