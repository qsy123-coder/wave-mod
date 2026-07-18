/**
 * 将爱弥斯 mod 的 preview.png 转为 WebP 格式后重新上传到 Supabase Storage
 * 用法: node scripts/convert-images-to-webp.mjs
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const STORAGE_BUCKET = "mod-assets";

async function main() {
  // 1. 查询所有爱弥斯 mod
  const { data: mods, error } = await supabase
    .from("mods")
    .select("id, title, images")
    .eq("character", "爱弥斯");

  if (error) {
    console.error("查询失败:", error.message);
    process.exit(1);
  }

  console.log(`找到 ${mods.length} 个爱弥斯 mod\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const mod of mods) {
    const imageUrl = mod.images?.[0];
    if (!imageUrl) {
      console.log(`  ⏭️  ${mod.title}: 无图片，跳过`);
      skipCount++;
      continue;
    }

    // 只处理 Supabase Storage 的 PNG 图片
    if (!imageUrl.includes("supabase.co") || !imageUrl.endsWith(".png")) {
      console.log(`  ⏭️  ${mod.title}: 非 Supabase PNG，跳过`);
      skipCount++;
      continue;
    }

    console.log(`  🔄 ${mod.title}...`);

    try {
      // 2. 下载原始 PNG
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.log(`    ❌ 下载失败: ${response.status}`);
        failCount++;
        continue;
      }
      const pngBuffer = Buffer.from(await response.arrayBuffer());
      console.log(`    📥 下载: ${(pngBuffer.length / 1024).toFixed(0)} KB`);

      // 3. 转换为 WebP (750px 宽, 80% 质量)
      const webpBuffer = await sharp(pngBuffer)
        .resize({ width: 750, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const reduction = ((1 - webpBuffer.length / pngBuffer.length) * 100).toFixed(0);
      console.log(`    🔧 转换: ${(webpBuffer.length / 1024).toFixed(0)} KB WebP (减小 ${reduction}%)`);

      // 4. 上传到 Supabase Storage (同路径, .webp 扩展名)
      // 原始路径: mods/aemeath/{uuid}/preview.png
      const oldPath = new URL(imageUrl).pathname.replace(
        `/storage/v1/object/public/${STORAGE_BUCKET}/`,
        ""
      );
      const newPath = oldPath.replace(/\.png$/i, ".webp");

      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(newPath, webpBuffer, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadErr) {
        console.log(`    ❌ 上传失败: ${uploadErr.message}`);
        failCount++;
        continue;
      }

      // 5. 获取新 URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(newPath);

      const newUrl = urlData.publicUrl;
      console.log(`    ✅ 新URL: ${newUrl.slice(0, 80)}...`);

      // 6. 更新数据库 (替换 images 数组中的 URL)
      const newImages = mod.images.map((url) =>
        url === imageUrl ? newUrl : url
      );

      const { error: updateErr } = await supabase
        .from("mods")
        .update({ images: newImages })
        .eq("id", mod.id);

      if (updateErr) {
        console.log(`    ❌ 数据库更新失败: ${updateErr.message}`);
        failCount++;
      } else {
        console.log(`    ✅ 数据库已更新`);
        successCount++;
      }
    } catch (err) {
      console.log(`    ❌ 异常: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n📊 完成: ${successCount} 成功, ${skipCount} 跳过, ${failCount} 失败`);
}

main();
