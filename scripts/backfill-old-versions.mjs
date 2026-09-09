/**
 * 顺带补全：给剩余缺迅雷的「旧版本」mod 找批量导出里的对应链接。
 * 仅生成清单 + 匹配建议，供人工确认。不写库。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const GAME_KEY = "wuthering-waves";
const MAP = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/xunlei-map.json";
const REPORT = "C:/Users/qsy123/.claude/projects/D--BaiduNetdiskDownload-WaveMod/backfill-report.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const map = JSON.parse(readFileSync(MAP, "utf8")).filter((r) => r.link && r.link.startsWith("http"));

// 已知异体字/角色别名 → 库内 character
const NORM = {
  "清霄": "清宵", "渊舞": "渊武", "女主": "女漂", "男主": "男漂", "洛瑟拉": "洛瑟菈",
};

// 剩余 18 个缺迅雷 mod：用 ID 从库里拉回全量，再按 title 判断
const ids = ["cc46ab51-a049-4104-ac71-9c0556ae42e7","094a3ddb-42a7-4361-9c46-5441af35de48","dc959481-bda9-4368-b05d-f2b1ea8f6e23","cea90de2-2b4c-4a30-9567-bac7ab099ad9","1b8e74cc-b899-48ab-9e55-112431150c09","3dce1674-fc26-4fc1-879c-af9723377a2b","5d5222ae-e9cf-4d66-9383-70bb418f13ce","9ec97c90-bd76-4ff8-9e10-fb584f1453bb","9310f351-b751-42fb-aa56-3aa35aa30930","0875b534-4b42-45f0-9423-471b27b27e1f","7ea48721-78dd-4ebe-99a0-12efd008bf1a","8c98a0bd-d470-4903-8536-1c504d71d232","a125631e-5caa-4b04-9a06-fbe3fa87d123","2d2c87e7-132b-49b5-af8f-a7a41c164fd8","b547f336-a2c5-408a-91f4-cb774e3ff690","5b56c256-12b4-4327-abb3-db04bc5abe3a","eb2d728e-2062-4a03-be09-7a22925cbdb1","1864153a-af63-4377-995c-c43e458b8352"];
const { data: rows } = await supabase.from("mods").select("id, title, character, drive_links").in("id", ids);
const byId = new Map(rows.map((r) => [r.id, r]));

// 每个 mod 的候选链接：宽松关键词匹配（角色异体字归一后比较 title 核心词）
const normT = (s) => (s || "").toLowerCase().replace(/\.exe$/i, "").replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-—－:：,，.。·]+/g, "");
const normChar = (c) => NORM[c] || c;

const results = [];
for (const id of ids) {
  const m = byId.get(id);
  if (!m) { results.push({ id, error: "not found" }); continue; }
  const titleN = normT(m.title);
  const charN = normChar(m.character);
  const cands = [];
  for (const r of map) {
    const name = r.name.replace(/\.exe$/i, "").trim();
    const nameN = normT(name);
    // 关键词：mod 标题里的中文字符串在批量名中出现
    const titleCore = (m.title || "").replace(/[（(【\[].*?[)）】\]]/g, "").replace(/by\s+\w+.*$/i, "").trim();
    // 简单判定：批量名去掉角色前缀后 含 或 被 标题核心词包含
    let hit = false;
    if (nameN.includes(titleN) || titleN.includes(nameN)) hit = true;
    // 半字异体字角色前缀修正后再试（清霄/渊舞）
    const noChar = name.replace(new RegExp(`^${m.character}`), "").replace(new RegExp(`^${normChar(m.character)}`), "");
    if (noChar && noChar !== name && (normT(noChar).includes(titleN) || titleN.includes(normT(noChar)))) hit = true;
    if (hit) cands.push({ xunlei: name, link: r.link, pwd: r.pwd });
  }
  results.push({ id, character: m.character, title: m.title, cands: dedup(cands) });
}
function dedup(rs) { const s = new Set(); const o = []; for (const r of rs) { if (!s.has(r.xunlei)) { s.add(r.xunlei); o.push(r); } } return o; }

writeFileSync(REPORT, JSON.stringify(results, null, 2), "utf8");

console.log("===== 剩余缺迅雷 mod 候选 =====");
for (const r of results) {
  console.log(`\n[${r.character}] ${r.title}`);
  if (!r.cands.length) { console.log("   ❌ 无批量候选"); continue; }
  r.cands.slice(0, 4).forEach((c) => console.log(`   ${c.xunlei}\n     → ${c.link}`));
}
console.log(`\n📄 报告: ${REPORT}`);
