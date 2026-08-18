import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { config } from "dotenv";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const IMG_DIR = resolve(process.cwd(), "offline-blur-src", "图片");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

// 模糊查标题含 定制-完整版 / 绯雪 的 MOD
const { data } = await supabase.from("mods")
  .select("id,title,is_published,images")
  .or(`title.ilike.%定制-完整版%,title.ilike.%绯雪%`);
console.log(`查到 ${data?.length ?? 0} 条:`);
for (const m of data ?? []) {
  console.log(`\n${m.title} | is_published=${m.is_published} | id=${m.id}`);
  console.log(`  images:`, m.images);
  const url = m.images?.[0];
  if (url) {
    const r = await fetch(url);
    const len = (await r.arrayBuffer()).byteLength;
    console.log(`  GET ${r.status}, ${(len / 1024).toFixed(1)}KB, lm=${r.headers.get("last-modified")}`);
  }
}

// 本地文件
console.log("\n本地相关文件:");
const files = readdirSync(IMG_DIR).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()) && (f.includes("绯雪") || f.includes("定制")));
for (const f of files) {
  const buf = await sharp(join(IMG_DIR, f)).resize({ width: 750, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  console.log(`  ${f} → 转webp ${(buf.length / 1024).toFixed(1)}KB`);
}
