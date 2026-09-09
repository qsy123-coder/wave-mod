/**
 * 给库内 mod 追加「迅雷网盘」链接。
 *
 * 数据来源: 迅雷网盘分享导出 xlsx → 已由 parse-xunlei-xlsx.ps1 解析为
 *   C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json
 *   (数组: [{ name, link, pwd, time, file }])，其中 name 为带 .exe 的分享文件名。
 *
 * 匹配策略（按强度，取唯一命中才写入）:
 *   rank0  精确: key === db.title (含括号，仅 trim+lower)
 *   rank1  去角色前缀: key 以 db.character 开头 → 前缀去除后 === db.title
 *   rank2  去括号: 双方括号内容/空白去除后相等
 *   rank3  去前缀+去括号: 组合
 *   命中 >1 → 判为歧义，不写入
 *
 * 写入: drive_links 数组**追加** { platform:'迅雷网盘', url }，已含迅雷则跳过。
 *
 * 用法:
 *   node scripts/update-xunlei-links.mjs            # --dry-run，只统计+出报告，不写库
 *   node scripts/update-xunlei-links.mjs --apply    # 实际写库
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MAP_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT_PATH = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-report.json";

const args = process.argv.slice(2);
const isApply = args.includes("--apply");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) { console.error("❌ 缺少 Supabase 环境变量"); process.exit(1); }
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

// ---------- 读取 xunlei 映射（过滤表头/坏行） ----------
const mapRaw = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const map = mapRaw.filter((r) => r.link && r.link.startsWith("http"));
console.log(`📥 迅雷有效记录: ${map.length}`);

// ---------- 拉取库内 mod ----------
const dbMods = [];
let from = 0; const PAGE = 1000;
while (true) {
  const { data, error } = await supabase.from("mods").select("id, title, character, drive_links").eq("game_key", GAME_KEY).range(from, from + PAGE - 1);
  if (error) { console.error("❌ 查询失败:", error.message); process.exit(1); }
  if (!data || !data.length) break;
  dbMods.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`🗄  库内 wuthering-waves mods: ${dbMods.length}`);

// ---------- 归一化助手 ----------
function normExact(s) { return s.trim().toLowerCase(); }
function normNoBracket(s) { return s.trim().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/\s+/g, "").toLowerCase(); }

// 角色别名：男主/女主 实际归 男漂/女漂（mod 名不变）
const CHAR_ALIAS = { "男主": "男漂", "女主": "女漂" };

// key 是否能拆出 dbChar 对应的标题：dbChar 预先给定，返回去掉「角色名 / 角色别名 + 角色名后括号描述 + 分隔符」后的标题
function stripToTitle(key, dbChar) {
  // 1. 直接用 dbChar 作为角色名
  let label = null;
  if (key.startsWith(dbChar)) label = dbChar;
  else {
    // 2. 尝试角色别名（如 key=男主-… 对应 dbChar=男漂）
    for (const [alias, target] of Object.entries(CHAR_ALIAS)) {
      if (target === dbChar && key.startsWith(alias)) { label = alias; break; }
    }
  }
  if (!label) return null;
  let rest = key.slice(label.length);
  // 3. 去掉角色名后紧跟的括号描述：男漂(含皮肤）-… / 爱弥斯（含机甲）-…
  rest = rest.replace(/^[（(][^）)]*[)）]/, "");
  // 4. 去掉分隔符
  rest = rest.replace(/^[-－\s:（(,，.]+/, "");
  return rest;
}
function deExe(name) { return name.replace(/\.exe$/i, "").trim(); }

// 预计算每个 mod 的各类键
for (const m of dbMods) {
  m._t = (m.title ?? "").trim();
  m._k0 = normExact(m._t);          // 精确
  m._k2 = normNoBracket(m._t);      // 去括号
}

// ---------- 匹配 ----------
const results = { matched: [], unmatched: [], ambiguous: [], multiLink: [] };
const used = new Set(); // 不做跨记录去重

for (const rec of map) {
  const key = deExe(rec.name);
  let bestRank = Infinity;
  let bestCandidates = [];
  for (const m of dbMods) {
    let rank = Infinity;
    if (normExact(key) === m._k0) rank = 0;
    else {
      // rank1: 去角色前缀（含 男主/女主 → 男漂/女漂，及角色名后括号描述）
      const stripped = stripToTitle(key, m.character);
      if (stripped !== null && normExact(stripped) === m._k0) rank = 1;
      else {
        // rank2: 去括号
        if (normNoBracket(key) === m._k2) rank = 2;
        else if (stripped !== null && normNoBracket(stripped) === m._k2) rank = 3;
      }
    }
    if (rank < bestRank) { bestRank = rank; bestCandidates = [m]; }
    else if (rank === bestRank && rank !== Infinity) { bestCandidates.push(m); }
  }
  if (bestRank === Infinity) { results.unmatched.push({ name: rec.name, link: rec.link }); continue; }
  if (bestCandidates.length !== 1) {
    results.ambiguous.push({ name: rec.name, link: rec.link, candidates: bestCandidates.map((c) => `${c.character}|${c._t}`) });
    continue;
  }
  results.matched.push({ key, modId: bestCandidates[0].id, character: bestCandidates[0].character, title: bestCandidates[0]._t, rank: bestRank, link: rec.link, name: rec.name });
}

// 安全网：同一 mod 命中多个不同迅雷链接。
// 绝大多数是同文件重复分享（文件名带 (N) 后缀 → 各自生成独立链接），取「规范名(无 (N) 后缀)」那份链接即可；
// 若规范名都有多个不同的链接（真·多个内容）才归入 multiLink 报告，不写库。
const byMod = new Map(); // modId -> records[]
for (const m of results.matched) {
  if (!byMod.has(m.modId)) byMod.set(m.modId, []);
  byMod.get(m.modId).push(m);
}
const stripTrailingDup = (nameNoExe) => nameNoExe.replace(/\(\d+\)$/, ""); // 去掉末尾 (1)/(2) 重复后缀
const kept = [];
for (const [modId, recs] of byMod) {
  const links = new Set(recs.map((r) => r.link));
  if (links.size === 1) { kept.push(recs[0]); continue; }
  // 成对判断：仅当「一条名去掉末尾(N)后 == 另一条名」才视为同一文件重复上传
  const names = recs.map((r) => r.name.replace(/\.exe$/i, ""));
  let canonical = null;
  if (recs.length === 2) {
    const [a, b] = names;
    if (stripTrailingDup(a) === b) canonical = recs.find((r, i) => i === 1); // a 是 b 的重复
    else if (stripTrailingDup(b) === a) canonical = recs.find((r, i) => i === 0);
  }
  if (canonical) {
    kept.push(canonical);
    results.multiLink.push({ modId, character: recs[0].character, title: recs[0].title, resolved: canonical.link, dropped: [...links].filter((l) => l !== canonical.link), names: recs.map((r) => r.name), deduped: true });
  } else {
    // 真·多个不同内容 → 不写库，报告
    results.multiLink.push({ modId, character: recs[0].character, title: recs[0].title, links: [...links], names: recs.map((r) => r.name), deduped: false });
  }
}
const deduped = results.multiLink.filter((x) => x.deduped).length;
const genuine = results.multiLink.filter((x) => !x.deduped).length;
results.multiLinkGenuine = results.multiLink.filter((x) => !x.deduped);
results.matched = kept;

console.log("\n=== 匹配结果 ===");
console.log(`✅ 唯一匹配: ${results.matched.length}`);
console.log(`⚠️ 歧义(多命中): ${results.ambiguous.length}`);
console.log(`🔶 一mod多链接(去重后写入): ${results.multiLink.filter((x) => x.deduped).length}`);
console.log(`🔴 一mod多链接(真·不同内容,跳过): ${results.multiLink.filter((x) => !x.deduped).length}`);
console.log(`❌ 未匹配: ${results.unmatched.length}`);

const rankDist = {};
for (const m of results.matched) rankDist[m.rank] = (rankDist[m.rank] || 0) + 1;
console.log("\n匹配等级分布:", JSON.stringify(rankDist));

// 已含迅雷的（应跳过的）
const already = results.matched.filter((m) => {
  const mrow = dbMods.find((d) => d.id === m.modId);
  return Array.isArray(mrow?.drive_links) && mrow.drive_links.some((d) => String(d.platform).includes("迅雷"));
});
console.log(`已含迅雷(跳过): ${already.length}`);

// 写报告
const report = {
  summary: { total: map.length, matched: results.matched.length, ambiguous: results.ambiguous.length, deduped: results.multiLink.filter((x) => x.deduped).length, genuineMultiLink: results.multiLink.filter((x) => !x.deduped).length, unmatched: results.unmatched.length, alreadyHasXunlei: already.length },
  matched: results.matched.map((m) => ({ name: m.name, modId: m.modId, character: m.character, title: m.title, link: m.link, rank: m.rank })),
  ambiguous: results.ambiguous,
  multiLink: results.multiLinkGenuine,
  unmatched: results.unmatched,
};
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
console.log(`📄 报告写入: ${REPORT_PATH}`);

// 样例展示
console.log("\n=== 匹配样例(前 10) ===");
for (const m of results.matched.slice(0, 10)) {
  console.log(`  [r${m.rank}] ${m.character} | ${m.title}  ->  ${m.link}`);
}
console.log("\n=== 未匹配样例(前 10) ===");
for (const u of results.unmatched.slice(0, 10)) console.log(`  ${u.name}`);

if (!isApply) {
  console.log("\n🔍 DRY-RUN: 未写库。确认无误后用 --apply 执行。");
  process.exit(0);
}

// ---------- 写库 ----------
async function apply() {
  const toUpdate = results.matched.filter((m) => !already.some((a) => a.modId === m.modId));
  console.log(`\n💾 开始写入 ${toUpdate.length} 条...`);
  let applied = 0, failed = 0;
  const BATCH = 25;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const slice = toUpdate.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const total = Math.ceil(toUpdate.length / BATCH);
    const tasks = [];
    for (const m of slice) {
      const mrow = dbMods.find((d) => d.id === m.modId);
      const cur = Array.isArray(mrow?.drive_links) ? mrow.drive_links : [];
      if (cur.some((d) => String(d.platform).includes("迅雷"))) continue;
      const next = [...cur, { platform: "迅雷网盘", url: m.link }];
      tasks.push(supabase.from("mods").update({ drive_links: next }).eq("id", m.modId));
    }
    const rels = await Promise.allSettled(tasks);
    rels.forEach((r) => { if (r.status === "fulfilled" && !r.value.error) applied++; else failed++; });
    console.log(`  批次 ${batchNum}/${total}: 应用 ${rels.filter((r) => r.status === "fulfilled" && !r.value.error).length}, 失败 ${rels.filter((r) => r.status === "rejected" || r.value.error).length}`);
  }
  console.log(`\n📊 完成: 成功 ${applied}, 失败 ${failed}`);
  // 统计未匹配的角色分布，帮助人工处理
}

apply().catch((e) => { console.error("❌ 写库失败:", e); process.exit(1); });
