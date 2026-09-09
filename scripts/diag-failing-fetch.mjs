/**
 * 诊断：取几个仍非 webp 的爱弥斯图，手动下载测速，判断是源/CDN 问题还是代码问题。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: mods } = await supabase.from("mods").select("id,title,images").eq("character", "爱弥斯");
function extOf(url){ const p=(url??"").split("?")[0]; const m=p.match(/\.([a-z0-9]+)$/i); return m?m[1].toLowerCase():""; }
// 仍是 png/jpg 的（未转成功）
const still = (mods??[]).filter((m)=> (m.images??[]).some((i)=> i && extOf(i)!=="webp"));
console.log(`仍非 webp 的爱弥斯: ${still.length} 条`);
for (const m of still) {
  const img = (m.images??[]).find((i)=> i && extOf(i)!=="webp");
  console.log(`\n[${extOf(img)}] ${m.title.slice(0,30)}\n  ${img}`);
  const t0 = Date.now();
  try {
    const r = await fetch(img, { signal: AbortSignal.timeout(90000) });
    const bytes = await r.arrayBuffer();
    console.log(`  ✅ ${r.status} ${(bytes.byteLength/1024).toFixed(0)}KB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`  ❌ ${Date.now()-t0}ms  ${e.name}: ${e.message}`);
  }
}
