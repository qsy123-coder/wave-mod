/**
 * 爱弥斯图批量转 WebP 重传 + 轮播回滚高清 PNG。
 *
 * 逻辑：
 *   1. 轮播 4 个 featured 爱弥斯 mod → 保留高清：
 *        - 金色蔷薇v1.4(76d91711)、不善女仆v1.21(58e579b5) 已是 webp → 回滚 images[0] 指向 Supabase 原图 PNG。
 *        - 可爱女仆、火花 已是 png → 不动。
 *   2. 其余非 webp 爱弥斯图（PNG + JPG/JPEG）→ 下载 → sharp 转 750px/q80 webp → 上传 COS
 *      mods/aemeath/{modId}/preview.webp → 更新 DB images。已 webp 的跳过。
 *
 * 并发 8 + 每请求 20s 超时 + 下载重试 2 次。幂等：已转(DB 为 webp)自动跳过。
 *
 * 用法:
 *   node scripts/convert-aemeath-to-webp.mjs --dry-run
 *   node scripts/convert-aemeath-to-webp.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
if (isDryRun) console.log("🔍 DRY-RUN：只列出计划，不写入任何数据。\n");

const CONCURRENCY = 1;
const FETCH_TIMEOUT_MS = 90000;
const DOWNLOAD_RETRIES = 6;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const cosBucket = process.env.COS_BUCKET;
const cosRegion = process.env.COS_REGION;
if (!cosBucket || !cosRegion) { console.error("❌ 缺少 COS 环境变量"); process.exit(1); }
function buildCosUrl(key) { return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${key}`; }
function uploadToCos(key, body, contentType) {
  return new Promise((res, rej) => cos.putObject({ Bucket: cosBucket, Region: cosRegion, Key: key, Body: body, ContentType: contentType }, (e, d) => (e ? rej(new Error(e.message)) : res(d))));
}

async function fetchBuffer(url) {
  let lastErr;
  for (let attempt = 0; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        // 超时/中断，重试
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else if (e instanceof TypeError) {
        // 网络错误，重试
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        break;
      }
    }
  }
  throw lastErr ?? new Error("下载失败");
}

// 轮播保持高清 PNG 的 mod：2 个需回滚（webp→png），2 个本就是 png（不动）
const REVERT_TO_PNG = [
  { modId: "76d91711-4f57-4056-b79f-3647a02f0fc1", title: "金色蔷薇v1.4 by 晨星", pngUrl: "https://xqwzgcxwdwpmkdbmzmve.supabase.co/storage/v1/object/public/mod-assets/mods/aemeath/76d91711-4f57-4056-b79f-3647a02f0fc1/preview.png" },
  { modId: "58e579b5-4a8e-475f-ae63-34cdda15003c", title: "不善女仆 v1.21", pngUrl: "https://xqwzgcxwdwpmkdbmzmve.supabase.co/storage/v1/object/public/mod-assets/mods/aemeath/58e579b5-4a8e-475f-ae63-34cdda15003c/preview.png" },
];
// 轮播内保持原样的 mod（可爱女仆 png / 火花 png），转换时排除
const CAROUSEL_KEEP_IDS = new Set([
  "76d91711-4f57-4056-b79f-3647a02f0fc1", // 金色蔷薇（回滚 png）
  "c88a7464-b2a2-4a3f-bd0e-a9e2f984f811", // 可爱女仆（本就 png）
  "7f7ae62f-4535-42ac-8567-5d0b196e6fa5", // 火花（本就 png）
  "58e579b5-4a8e-475f-ae63-34cdda15003c", // 不善女仆（回滚 png）
]);

function extOf(url) {
  const path = (url ?? "").split("?")[0];
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

async function main() {
  const { data: mods, error } = await supabase.from("mods").select("id,title,character,images,is_featured").eq("character", "爱弥斯");
  if (error) { console.error("查询失败:", error.message); process.exit(1); }
  const modById = new Map(mods.map((m) => [m.id, m]));
  console.log(`爱弥斯 mod 共 ${mods.length} 条\n`);

  // ===== ① 回滚轮播 webp → 高清 PNG =====
  console.log("===== ① 轮播回滚 webp → 高清 PNG =====");
  let revertRows = 0;
  for (const r of REVERT_TO_PNG) {
    const mod = modById.get(r.modId);
    if (!mod) { console.log(`   ⚠️ 未找到 ${r.title} (${r.modId})`); continue; }
    const changed = (mod.images ?? []).map((img) => (extOf(img) === "webp" ? r.pngUrl : img));
    const needsUpdate = JSON.stringify(changed) !== JSON.stringify(mod.images);
    console.log(`   ${needsUpdate ? "🔄" : "⚪"} ${r.title}  ${mod.images[0]?.slice(-45)} → ${r.pngUrl.slice(-45)}`);
    if (needsUpdate && !isDryRun) {
      const { error: upErr } = await supabase.from("mods").update({ images: changed }).eq("id", r.modId);
      if (upErr) console.log(`      ❌ ${upErr.message}`);
      else { revertRows++; console.log("      ✅ 已更新"); }
    }
  }
  if (isDryRun) console.log("   (DRY-RUN，不写入)");
  else console.log(`   回滚更新 ${revertRows} 条`);

  // ===== ② 收集转换目标 =====
  console.log("\n===== ② 批量转 WebP（并发） =====");
  const groups = new Map();
  for (const m of mods) {
    if (CAROUSEL_KEEP_IDS.has(m.id)) continue;
    const items = [];
    for (const [i, img] of (m.images ?? []).entries()) {
      if (!img) continue;
      if (extOf(img) === "webp") continue;
      items.push({ index: i, url: img, ext: extOf(img) });
    }
    if (items.length) groups.set(m.id, { title: m.title, originalImages: [...(m.images ?? [])], items });
  }
  const totalImages = [...groups.values()].reduce((s, g) => s + g.items.length, 0);
  console.log(`待转换: ${totalImages} 张, 涉及 ${groups.size} 个 mod\n`);
  if (totalImages === 0) { console.log("无可转换，完成。"); return; }

  if (isDryRun) {
    console.log(`🔍 DRY-RUN 完成，共 ${totalImages} 张待转（未写入）。`);
    return;
  }

  // ===== ③ 并发处理（每 mod 一次 DB 写） =====
  const jobs = [...groups.entries()].map(([modId, g]) => ({ modId, ...g }));
  let idx = 0;
  let converted = 0, failed = 0; const failList = [];
  const start = Date.now();

  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      const newImages = [...j.originalImages];
      try {
        for (const it of j.items) {
          const targetKey = `mods/aemeath/${j.modId}/preview${it.index === 0 ? "" : "-" + it.index}.webp`;
          const buf = await fetchBuffer(it.url);
          const webp = await sharp(buf).resize({ width: 750, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          await uploadToCos(targetKey, webp, "image/webp");
          newImages[it.index] = buildCosUrl(targetKey);
        }
        const { error: upErr } = await supabase.from("mods").update({ images: newImages }).eq("id", j.modId);
        if (upErr) throw new Error(`DB 更新失败 ${upErr.message}`);
        converted++; console.log(`   ✅ [${j.items.map((i) => i.ext).join("/")}] ${j.title.slice(0, 32)} (${j.items.length}张)`);
      } catch (e) {
        failed++; failList.push(`${j.title} (${e.message.slice(-80)})`);
        console.log(`   ❌ ${j.title.slice(0, 32)}  ${e.message.slice(-60)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mins = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n📊 完成: 转换 ${converted} 组, 失败 ${failed} 组 (耗时 ${mins} 分钟)`);
  if (failList.length) { console.log("失败清单:"); failList.forEach((f) => console.log(`   - ${f}`)); }
}

main().catch((e) => { console.error("执行失败:", e); process.exit(1); });
