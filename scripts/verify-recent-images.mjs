/**
 * 一次性校验脚本：抽查某个日期之后入库的 mod，其预览图 URL 是否真的可公开访问。
 * 用途：upload-daily-by-date.mjs 只在 putObject 回调成功时打 ✅，
 *      COS 权限/路径问题不会报错，需单独 HEAD 验证。
 *
 * 用法: node scripts/verify-recent-images.mjs --after=2026-09-13
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const afterArg = process.argv.find((a) => a.startsWith("--after="));
const after = afterArg ? afterArg.slice("--after=".length).trim() : null;
if (!after) {
  console.error("用法: node scripts/verify-recent-images.mjs --after=YYYY-MM-DD");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const rows = [];
const PAGE_SIZE = 1000;
for (let from = 0; ; from += PAGE_SIZE) {
  const { data, error } = await supabase
    .from("mods")
    .select("character, title, images, created_at")
    .eq("game_key", "wuthering-waves")
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) {
    console.error("❌ 查询失败:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < PAGE_SIZE) break;
}

const targets = rows
  .filter((r) => String(r.created_at ?? "").slice(0, 10) >= after)
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

console.log(`校验 ${targets.length} 条（${after} 起入库）的预览图可访问性\n`);

let ok = 0;
let bad = 0;
for (const m of targets) {
  const url = Array.isArray(m.images) ? m.images[0] : null;
  if (!url) {
    console.log(`❌ 无图  ${m.created_at.slice(0, 10)}  ${m.character} | ${m.title}`);
    bad++;
    continue;
  }
  try {
    // 带 cache-buster，避免 CDN 命中旧缓存掩盖真实状态
    const res = await fetch(`${url}?t=${Date.now()}`, { method: "GET" });
    const bytes = (await res.arrayBuffer()).byteLength;
    if (res.ok && bytes > 0) {
      console.log(`✅ ${res.status} ${(bytes / 1024).toFixed(1).padStart(6)}KB  ${m.created_at.slice(0, 10)}  ${m.character} | ${m.title}`);
      ok++;
    } else {
      console.log(`❌ ${res.status} ${(bytes / 1024).toFixed(1)}KB  ${m.created_at.slice(0, 10)}  ${m.character} | ${m.title}  ${url}`);
      bad++;
    }
  } catch (err) {
    console.log(`❌ 请求异常 ${m.character} | ${m.title}: ${err.message}`);
    bad++;
  }
}

console.log(`\n📊 可访问 ${ok} 条，异常 ${bad} 条`);
process.exit(bad > 0 ? 1 : 0);
