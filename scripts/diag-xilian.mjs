/** 诊断两个未打码 MOD：DB images 全部字段 + COS 对象实际内容 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";

config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION;

const titles = ["昔涟-天使之翼 by woju（890切换）", "昔涟-天使之翼-多色切换 by woju（7890切换）"];
const { data } = await supabase.from("mods").select("id,title,images").in("title", titles);
console.log(`查到 ${data?.length ?? 0} 条`);
for (const m of data ?? []) {
  console.log(`\n=== ${m.title}  id=${m.id}`);
  console.log(`images:`, m.images);
  for (const url of m.images ?? []) {
    const key = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    let head;
    try {
      head = await new Promise((res) => cos.headObject({ Bucket: bucket, Region: region, Key: key }, (e, d) => res(e ? { err: e.message } : d)));
    } catch (e) { head = { err: String(e) }; }
    let r;
    try {
      r = await fetch(url);
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(`  URL: ${url}`);
      console.log(`    key=${key}  head=${head.err ? "ERR " + head.err : `lm=${head.LastModified} len=${head.ContentLength}`}`);
      console.log(`    GET: ${r.status} len=${buf.length} lm=${r.headers.get("last-modified")} ct=${r.headers.get("content-type")}`);
    } catch (e) {
      console.log(`  URL: ${url}\n    GET ERR: ${e.message}`);
    }
  }
}

// 本地打码文件里带 昔涟 的
const dir = resolve(process.cwd(), "offline-blur-src", "图片");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const related = readdirSync(dir).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()) && f.includes("昔涟"));
console.log(`\n本地带「昔涟」的文件 (${related.length}):`);
for (const f of related) console.log(`  ${f}  (${(statSync(join(dir, f)).size / 1024).toFixed(1)}KB)`);
