/**
 * 批量上传 troubleshooting 图片到腾讯云 COS
 *
 * 用法:
 *   node scripts/upload-troubleshooting-images.mjs
 *   node scripts/upload-troubleshooting-images.mjs --dry-run
 *
 * 环境变量:
 *   COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(process.cwd(), ".env"), override: true });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// ── COS 初始化 ──
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

const imagesDir = path.resolve(process.cwd(), "content", "troubleshooting", "images");

function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

function getContentType(ext) {
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext.toLowerCase()] || "image/png";
}

function uploadToCos(objectKey, body, contentType) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      },
      (err, data) => {
        if (err) reject(new Error(`COS 上传失败: ${err.message}`));
        else resolve(data);
      },
    );
  });
}

async function main() {
  if (!fs.existsSync(imagesDir)) {
    console.error("❌ 图片目录不存在:", imagesDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(imagesDir)
    .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
    .sort((a, b) => {
      // 按数字排序: image1, image2, ... image10, image11 ...
      const numA = parseInt(a.match(/\d+/)?.[0] || "0", 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || "0", 10);
      return numA - numB;
    });

  console.log(`📊 共找到 ${files.length} 张图片\n`);

  if (isDryRun) {
    console.log("🔍 DRY-RUN 模式：仅预览，不实际上传。\n");
    for (const f of files) {
      const objectKey = `troubleshooting/${f}`;
      console.log(`  ${f} → ${buildCosUrl(objectKey)}`);
    }
    console.log(`\n💡 去掉 --dry-run 参数可执行实际上传。`);
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const urlMap = []; // { file, url }

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const filePath = path.join(imagesDir, f);
    const objectKey = `troubleshooting/${f}`;
    const ext = path.extname(f);
    const contentType = getContentType(ext);

    try {
      const body = fs.readFileSync(filePath);
      console.log(`⬆️  [${i + 1}/${files.length}] 上传: ${f} (${(body.length / 1024).toFixed(1)} KB)`);
      await uploadToCos(objectKey, body, contentType);
      const url = buildCosUrl(objectKey);
      console.log(`   ✅ ${url}`);
      urlMap.push({ file: f, url });
      successCount++;
    } catch (err) {
      console.error(`   ❌ ${f}: ${err.message}`);
      failCount++;
    }
  }

  console.log("\n═══════════════════════════════════");
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log("═══════════════════════════════════");

  if (urlMap.length > 0) {
    console.log("\n📋 URL 映射（可复制到 markdown）:");
    for (const { file, url } of urlMap) {
      const num = file.match(/\d+/)?.[0] || "?";
      console.log(`  image${num} → ${url}`);
    }
  }
}

main().catch((err) => {
  console.error("上传脚本出错:", err);
  process.exit(1);
});
