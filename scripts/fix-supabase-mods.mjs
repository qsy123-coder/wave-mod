/**
 * 修复 Supabase Storage 托管的 2 个 MOD（昔涟-天使之翼 两兄弟）：
 * 上次回传把打码图传到了 COS，但这两个 MOD 的 images[0] 指向 Supabase Storage，
 * 站点读的是 Supabase 原图 → 没打码。
 *
 * 方案：打码图转 webp → 上传 COS（mods/aemeath/{id}/preview.webp）→ 更新 DB images[0]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION;
const IMG_DIR = resolve(process.cwd(), "offline-blur-src", "图片");

// id, 打码文件名, 角色 slug（沿用 Supabase 路径里的 aemeath）
const FIXES = [
  { id: "b31467bf-f7ce-42e5-9e6d-679cccdadf93", file: "昔涟-天使之翼 by woju（890切换）.png", slug: "aemeath" },
  { id: "04036198-be3e-4e64-82b9-cb67275b52c7", file: "昔涟-天使之翼-多色切换 by woju（7890切换）.png", slug: "aemeath" },
];

function putObject(key, body) {
  return new Promise((res, rej) =>
    cos.putObject({ Bucket: bucket, Region: region, Key: key, Body: body, ContentType: "image/webp" },
      (err) => (err ? rej(new Error(err.message)) : res()))
  );
}

async function main() {
  for (const f of FIXES) {
    const key = `mods/${f.slug}/${f.id}/preview.webp`;
    const url = `https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/${key}`;

    // 1) 取 DB 当前 images，确认 images[0] 确实是 Supabase
    const { data, error } = await supabase.from("mods").select("id,title,images").eq("id", f.id).single();
    if (error || !data) { console.log(`❌ ${f.id}: 查询失败 ${error?.message ?? ""}`); continue; }
    const oldUrl = data.images?.[0] ?? "";
    if (!oldUrl.includes("supabase.co")) { console.log(`⏭ ${data.title}: images[0] 不是 Supabase（${oldUrl.slice(0, 60)}），跳过`); continue; }

    // 2) 转 webp 上传 COS
    const buf = await sharp(readFileSync(join(IMG_DIR, f.file)))
      .resize({ width: 750, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await putObject(key, buf);
    console.log(`✅ 已上传 COS: ${key} (${(buf.length / 1024).toFixed(1)}KB)`);

    // 3) 更新 DB images[0]
    const newImages = [...(data.images ?? [])];
    newImages[0] = url;
    const { error: upErr } = await supabase.from("mods").update({ images: newImages }).eq("id", f.id);
    if (upErr) { console.log(`❌ ${data.title}: DB 更新失败 ${upErr.message}`); continue; }
    console.log(`✅ DB 已更新 ${data.title}: images[0] → ${url}`);

    // 4) 验证 GET
    const r = await fetch(url);
    const len = (await r.arrayBuffer()).byteLength;
    console.log(`   验证: GET ${r.status}, ${(len / 1024).toFixed(1)}KB (期望约 ${(buf.length / 1024).toFixed(1)}KB) ${len === buf.length ? "✓一致" : "⚠不等"}`);
  }
  console.log("\n完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
