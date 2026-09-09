/**
 * 单点修复：火花v1.1 (mod 344726a5) 图转 webp。
 * 源对象是全网最慢的一个（196s），用 COS SDK getObject（UTF-8 key）拉取、给足 300s。
 * 只改这个非轮播 mod，不动共用对象的轮播"火花"。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const MOD_ID = "344726a5-1132-471e-96e2-a00965eca1c6";
const SRC_KEY = "mods/aemeath/A_clear_png/爱弥斯-火花v1.1.png";
const DEST_KEY = `mods/aemeath/${MOD_ID}/preview.webp`;
const TIMEOUT_MS = 300_000;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const B = process.env.COS_BUCKET, R = process.env.COS_REGION;
function buildCosUrl(key){ return `https://${B}.cos.${R}.myqcloud.com/${key}`; }

function getObjectWithTimeout(key, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("getObject timeout")), ms).unref?.();
    cos.getObject({ Bucket: B, Region: R, Key: key }, (e, d) => { clearTimeout(t); e ? rej(new Error(e.message)) : res(d); });
  });
}

// 1) 读取 DB 当前状态
const { data: mod, error } = await supabase.from("mods").select("id,title,images").eq("id", MOD_ID).single();
if (error || !mod) { console.error("查不到 mod:", error?.message ?? "not found"); process.exit(1); }
console.log(`mod: ${mod.title} (${mod.id})`);
console.log(`images: ${JSON.stringify(mod.images)}`);

// 2) SDK 拉取源（慢但可完成）
const t0 = Date.now();
console.log(`开始下载 ${SRC_KEY} (可能 3 分钟)...`);
const g = await getObjectWithTimeout(SRC_KEY, TIMEOUT_MS);
const buf = Buffer.isBuffer(g.Body) ? g.Body : Buffer.from(g.Body);
console.log(`下载完成: ${(buf.byteLength / 1048576).toFixed(2)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const headHex = buf.subarray(0, 8).toString("hex");
if (headHex !== "89504e470d0a1a0a") { console.log(`⚠️ 非 PNG 魔数: ${headHex}`); }
else console.log(`PNG 魔数校验 ✓`);

// 3) sharp 转 webp
const webp = await sharp(buf).resize({ width: 750, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
console.log(`转 webp: ${(webp.byteLength / 1024).toFixed(0)}KB (原 ${(buf.byteLength / 1024).toFixed(0)}KB)`);

// 4) 上传 COS
const newUrl = buildCosUrl(DEST_KEY);
await new Promise((res, rej) => cos.putObject({ Bucket: B, Region: R, Key: DEST_KEY, Body: webp, ContentType: "image/webp" }, (e, d) => e ? rej(new Error(e.message)) : res(d)));
console.log(`上传成功: ${newUrl}`);

// 5) 更新 DB images[0]
const newImages = [newUrl];
const { error: upErr } = await supabase.from("mods").update({ images: newImages }).eq("id", MOD_ID);
if (upErr) { console.error("DB 更新失败:", upErr.message); process.exit(1); }
console.log("DB 已更新:", JSON.stringify(newImages));

// 6) 验证
const { data: v } = await supabase.from("mods").select("images").eq("id", MOD_ID).single();
console.log(`\n验证 images[0]=${v?.images?.[0]}`);
console.log("完成 ✓");
