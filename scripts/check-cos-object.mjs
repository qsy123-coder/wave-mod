/** 诊断：COS 源站对象是否已被覆盖（Last-Modified / Content-Length），并对比 CDN 缓存 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
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

// 抽查 3 个刚回传的 MOD
const titles = ["时韵v1.12 by 狩野樱（上下左右？。切换）", "逆兔女仆", "SM培训专家 by MeetFlab（ctrl+？切换）"];
const { data } = await supabase.from("mods").select("title, images").in("title", titles).limit(5);
if (!data?.length) { console.log("未查到样本"); process.exit(0); }

for (const m of data) {
  const url = m.images?.[0];
  const objectKey = new URL(url).pathname.replace(/^\//, "");

  // 1) COS 源站 headObject（绕 CDN，看真实覆盖时间）
  const head = await new Promise((res) => cos.headObject(
    { Bucket: bucket, Region: region, Key: objectKey },
    (err, d) => res(err ? { err } : d)
  ));

  // 2) 通过 URL 带 cache-buster 拉取（看 CDN 是否返回旧缓存）
  const busted = `${url}?t=${Date.now()}`;
  const res = await fetch(busted, { headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" } });
  const buf = Buffer.from(await res.arrayBuffer());

  console.log(`\n${m.title}`);
  console.log(`  objectKey: ${objectKey}`);
  if (head.err) {
    console.log(`  COS headObject ERR: ${head.err.message}`);
  } else {
    console.log(`  COS 源站 Last-Modified: ${head.LastModified}   Content-Length: ${head.ContentLength || head['content-length'] || '?'}`);
  }
  console.log(`  URL 带cache-buster: HTTP ${res.status}, ${(buf.length/1024).toFixed(1)}KB, 缓存头: ${res.headers.get('x-cache-lookup') ?? '无'}/${res.headers.get('cache-control') ?? '无'}`);
}
