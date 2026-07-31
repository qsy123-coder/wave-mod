/**
 * 将 Supabase Storage 中的 Mod 预览图批量迁移到腾讯云 COS
 *
 * 用法:
 *   node scripts/migrate-to-cos.mjs
 *
 * 环境变量要求:
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   COS_SECRET_ID
 *   COS_SECRET_KEY
 *   COS_BUCKET      — 格式: {name}-{appid}，如 my-bucket-1250000000
 *   COS_REGION      — 如 ap-guangzhou、ap-shanghai
 *
 * 特性:
 *   - 幂等：已迁移的图片（URL 含 .cos. 和 .myqcloud.com）自动跳过
 *   - 逐 mod 更新数据库，单张失败不影响其他
 *   - --dry-run 仅预览不执行
 *   - --character=<name> 仅迁移指定角色
 */

import { createClient } from "@supabase/supabase-js";
import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ── 参数解析 ──
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const charArg = args.find((a) => a.startsWith("--character="));
const targetCharacter = charArg?.split("=")[1]?.trim() || null;

// ── 客户端初始化 ──
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ 缺少 Supabase 环境变量。需要 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();

if (!cosSecretId || !cosSecretKey || !cosBucket || !cosRegion) {
  console.error("❌ 缺少 COS 环境变量。需要 COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION。");
  process.exit(1);
}

const cos = new COS({
  SecretId: cosSecretId,
  SecretKey: cosSecretKey,
});

// ── 工具函数 ──

/** COS 公开 URL */
function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

/** 从 Supabase URL 提取 object key（bucket 名称后的路径部分） */
function extractSupabaseObjectKey(url) {
  // URL 格式: https://<ref>.supabase.co/storage/v1/object/public/mod-assets/mods/{char}/{modId}/{filename}
  const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 判断 URL 是否已是 COS 地址（表示已迁移） */
function isCosUrl(url) {
  return url.includes(".cos.") && url.includes(".myqcloud.com/");
}

/** 判断 URL 是否来自 Supabase Storage */
function isSupabaseUrl(url) {
  return url.includes("supabase.co") && url.includes("/storage/v1/object/public/");
}

/** 暂停 ms 毫秒 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 下载 Supabase Storage 图片为 Buffer（含重试） */
async function downloadImage(url, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`  重试 ${attempt}/${retries}（${delay / 1000}s 后）...`);
        await sleep(delay);
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`下载失败（已重试 ${retries} 次）: ${lastError?.message || lastError}`);
}

/** 上传图片到 COS */
function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: objectKey,
        Body: body,
        ContentType: contentType || "image/webp",
      },
      (err, data) => {
        if (err) {
          reject(new Error(`COS 上传失败: ${err.message}`));
        } else {
          resolve(data);
        }
      },
    );
  });
}

/** 检测 Content-Type */
function detectContentType(url) {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0];
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext] || "image/webp";
}

// ── 主流程 ──
async function main() {
  if (isDryRun) {
    console.log("🔍 DRY-RUN 模式：仅预览，不执行实际操作。\n");
  }

  // 1. 查询 Mod
  let query = supabase.from("mods").select("id, title, character, images").not("images", "is", null);
  if (targetCharacter) {
    query = query.eq("character", targetCharacter);
  }

  const { data: mods, error } = await query;

  if (error) {
    console.error("❌ 查询 Mod 失败:", error.message);
    process.exit(1);
  }

  console.log(`📊 共找到 ${mods.length} 个 Mod\n`);

  let migratedCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const failures = [];

  for (const mod of mods) {
    const images = mod.images || [];
    if (images.length === 0) continue;

    const newImages = [];
    let modChanged = false;

    for (const imageUrl of images) {
      // 已是 COS URL，跳过
      if (isCosUrl(imageUrl)) {
        newImages.push(imageUrl);
        skipCount++;
        continue;
      }

      // 不是 Supabase URL，保留原样
      if (!isSupabaseUrl(imageUrl)) {
        newImages.push(imageUrl);
        skipCount++;
        continue;
      }

      const objectKey = extractSupabaseObjectKey(imageUrl);
      if (!objectKey) {
        console.warn(`⚠️  无法解析对象键: ${imageUrl}`);
        newImages.push(imageUrl);
        skipCount++;
        continue;
      }

      const cosUrl = buildCosUrl(objectKey);
      const label = `${mod.title} (${mod.character}) — ${objectKey}`;

      if (isDryRun) {
        console.log(`🔍 [DRY-RUN] ${label}`);
        console.log(`   源: ${imageUrl}`);
        console.log(`   目标: ${cosUrl}\n`);
        newImages.push(imageUrl); // dry-run 不修改
        skipCount++;
        continue;
      }

      try {
        // 下载
        console.log(`⬇️  下载: ${label}`);
        const imageBuffer = await downloadImage(imageUrl);
        const contentType = detectContentType(imageUrl);

        // 上传到 COS
        console.log(`⬆️  上传到 COS: ${objectKey}`);
        await uploadToCos(objectKey, imageBuffer, contentType);

        // 更新 URL
        newImages.push(cosUrl);
        modChanged = true;
        migratedCount++;
        console.log(`✅ 迁移成功: ${cosUrl}\n`);
      } catch (err) {
        console.error(`❌ 迁移失败: ${label} — ${err.message}\n`);
        newImages.push(imageUrl); // 保留原 URL
        failCount++;
        failures.push({ mod: mod.title, character: mod.character, url: imageUrl, error: err.message });
      }
    }

    // 更新数据库
    if (modChanged) {
      const { error: updateError } = await supabase
        .from("mods")
        .update({ images: newImages })
        .eq("id", mod.id);

      if (updateError) {
        console.error(`❌ 数据库更新失败: ${mod.title} — ${updateError.message}`);
        failCount++;
        failures.push({ mod: mod.title, character: mod.character, error: updateError.message });
      } else {
        console.log(`💾 数据库已更新: ${mod.title}\n`);
      }
    }

    // 节流：每个 mod 间隔 200ms，避免触发 Supabase 限流
    if (!isDryRun) {
      await sleep(200);
    }
  }

  // 汇总
  console.log("═══════════════════════════════════");
  console.log(`✅ 迁移成功: ${migratedCount}`);
  console.log(`⏭️  已跳过:   ${skipCount}`);
  console.log(`❌ 失败:     ${failCount}`);
  console.log("═══════════════════════════════════");

  if (failures.length > 0) {
    console.log("\n失败详情:");
    failures.forEach((f) => console.log(`  - ${f.character}/${f.mod}: ${f.error}`));
  }

  if (isDryRun) {
    console.log("\n💡 这是 dry-run 结果。去掉 --dry-run 参数可执行实际迁移。");
  }
}

main().catch((err) => {
  console.error("迁移脚本出错:", err);
  process.exit(1);
});
