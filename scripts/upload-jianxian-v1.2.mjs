/**
 * 补传 9.7 漏掉的「清宵-邪 · 剑仙v1.2（0）by 晨星」。
 * 结构完全复刻库内已有「邪 · 剑仙v1.0full（0）by 晨星」：
 *   title=邪 · 剑仙v1.2（0）by 晨星（去 清宵- 前缀），character=清宵
 *   上传本地 v1.2 预览图 → COS mods/清宵/<uuid>/preview.webp
 *   写 Supabase mods（drive_links=[夸克网盘+迅雷网盘]，images=[preview.webp]，created_at=2026-09-07）
 * 幂等：库里已存在 title 则跳过。
 * 用法：node scripts/upload-jianxian-v1.2.mjs           # dry-run
 *       node scripts/upload-jianxian-v1.2.mjs --apply   # 实际上传+入库
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const isApply = process.argv.includes("--apply");

const GAME_KEY = "wuthering-waves";
const GAME_VERSION = "未标注";
const XXMI_GUIDE = [
  "1. 下载并解压对应 MOD 压缩包。",
  "2. 打开 XXMI Launcher，确认当前游戏版本与 MOD 版本匹配。",
  "3. 将 MOD 文件夹复制到 XXMI Mods 目录。",
  "4. 返回启动器启用对应角色模组后进入游戏检查效果。",
].join("\n");

// 目标数据
const TITLE = "邪 · 剑仙v1.2（0）by 晨星";
const CHARACTER = "清宵";
const QUARK_URL = "https://pan.quark.cn/s/d64ea0789d68?pwd=WfPG";
const XUNLEI_URL = null; // 迅雷链接未知则不加；库内 v1.0full 有迅雷，v1.2 先只加夸克
const IMG_PATH = "D:/BaiduNetdiskDownload/MC-MOD整合包/wMOD全集-每日更新/A_每日更新/W-2026.9.7/清宵-邪 · 剑仙v1.2（0）by 晨星.jpg";
const CREATED_AT = "2026-09-07T04:00:00.000Z"; // 上海中午，归组 9.7

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
if (!supabaseUrl || !serviceRoleKey) { console.error("❌ 缺 Supabase 环境变量"); process.exit(1); }
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey });
const buildCosUrl = (o) => `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${o}`;
function uploadToCos(key, body, ct) {
  return new Promise((res, rej) => cos.putObject({ Bucket: cosBucket, Region: cosRegion, Key: key, Body: body, ContentType: ct }, (e, d) => e ? rej(new Error(e.message)) : res(d)));
}
const slugify = (n) => (n.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "mod");

// 幂等检查
const { data: exists, error: e0 } = await supabase.from("mods").select("id, title").eq("game_key", GAME_KEY).eq("title", TITLE).limit(5);
if (e0) { console.error("❌ 查重失败:", e0.message); process.exit(1); }
if (exists && exists.length > 0) { console.log(`⏭️  已存在，跳过: ${TITLE} (id=${exists[0].id})`); process.exit(0); }

if (!existsSync(IMG_PATH)) { console.error("❌ 预览图不存在:", IMG_PATH); process.exit(1); }

const modId = randomUUID();
const version = "v1.2";

// 转换预览图 → webp
const orig = readFileSync(IMG_PATH);
const webp = await sharp(orig).resize({ width: 750, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
const objectKey = `mods/${slugify(CHARACTER)}/${modId}/preview.webp`;
const imageUrl = buildCosUrl(objectKey);

const drive_links = [{ platform: "夸克网盘", url: QUARK_URL }];
if (XUNLEI_URL) drive_links.push({ platform: "迅雷网盘", url: XUNLEI_URL });

const mod = {
  id: modId,
  title: TITLE,
  character: CHARACTER,
  game_key: GAME_KEY,
  game_version: GAME_VERSION,
  version,
  description: `${CHARACTER} ${TITLE} MOD，夸克网盘下载。`,
  download_url: null,
  drive_links,
  nsfw: false,
  is_published: true,
  is_available: true,
  images: [imageUrl],
  xxmi_install_guide: XXMI_GUIDE,
  mod_author_url: null,
  video_url: null,
  created_by: null,
  created_at: CREATED_AT,
};

console.log("📋 待入库:");
console.log(`  title=${TITLE}`);
console.log(`  character=${CHARACTER}`);
console.log(`  version=${version}`);
console.log(`  images=${imageUrl}`);
console.log(`  drive_links=${JSON.stringify(drive_links)}`);
console.log(`  created_at=${CREATED_AT}`);

if (!isApply) { console.log("\n🔍 DRY-RUN: 未上传未入库。确认后用 --apply。"); process.exit(0); }

console.log(`\n📤 上传预览图到 COS...`);
await uploadToCos(objectKey, webp, "image/webp");
console.log(`  ✅ ${imageUrl}`);

const { error } = await supabase.from("mods").insert(mod);
if (error) { console.error("❌ 入库失败:", error.message); process.exit(1); }
console.log(`\n✅ 入库成功 (id=${modId})`);
