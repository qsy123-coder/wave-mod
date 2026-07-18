/**
 * 补充上传 3 个缺失 preview 图片的 mod
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BASE = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\爱弥斯\00`;

const mods = [
  { folder: "爱弥斯-半透衬衫", title: "半透衬衫" },
  { folder: "爱弥斯-超汝巨屯 by NAHCYOR(alt+1234切换）", title: "超汝巨屯 by NAHCYOR(alt+1234切换）" },
  { folder: "爱弥斯-纯洁新娘 by 幽魂小猫（alt+？切换）", title: "纯洁新娘 by 幽魂小猫（alt+？切换）" },
];

async function main() {
  for (const mod of mods) {
    const folderPath = join(BASE, mod.folder);
    console.log(`\nFolder: ${folderPath}`);
    const files = readdirSync(folderPath);
    const pngs = files.filter((f) => f.toLowerCase().endsWith(".png"));
    console.log(`PNGs: ${pngs.join(", ")}`);

    // 优先 preview.png，否则第一个 PNG
    let pngFile = pngs.find((f) => f === "preview.png") || pngs[0];
    if (!pngFile) {
      console.log("  ❌ No PNG found!");
      continue;
    }

    const pngPath = join(folderPath, pngFile);
    console.log(`  Using: ${pngFile}`);

    // 查数据库
    const { data: rows } = await supabase
      .from("mods")
      .select("id, images")
      .eq("title", mod.title)
      .eq("character", "爱弥斯");

    if (!rows || rows.length === 0) {
      console.log("  ❌ Mod not found in DB!");
      continue;
    }
    const dbMod = rows[0];
    console.log(`  DB ID: ${dbMod.id}`);

    // 上传
    const storagePath = `mods/aemeath/${dbMod.id}/preview.png`;
    const fileBuffer = readFileSync(pngPath);
    const { error: uploadErr } = await supabase.storage
      .from("mod-assets")
      .upload(storagePath, fileBuffer, {
        cacheControl: "31536000",
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.log(`  ❌ Upload error: ${uploadErr.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("mod-assets")
      .getPublicUrl(storagePath);
    console.log(`  ✅ URL: ${urlData.publicUrl}`);

    // 更新数据库
    const newImages = [...(dbMod.images || []), urlData.publicUrl];
    const { error: updateErr } = await supabase
      .from("mods")
      .update({ images: newImages })
      .eq("id", dbMod.id);

    if (updateErr) {
      console.log(`  ❌ DB update error: ${updateErr.message}`);
    } else {
      console.log(`  ✅ DB updated`);
    }
  }
  console.log("\nDone!");
}

main().catch((e) => console.error(e));
