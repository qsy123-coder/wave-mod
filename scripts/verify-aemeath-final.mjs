/**
 * 终验：全量爱弥斯图状态 + 轮播 4 个 mod 的封面。
 * 输出：非 webp 清单（排除轮播保留）、轮播 mod 的 images[0]、火花v1.1 详情。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: mods, error } = await supabase.from("mods").select("id,title,images,is_featured,featured_order").eq("character", "爱弥斯");
if (error) { console.error("查询失败:", error.message); process.exit(1); }
function extOf(url){ const p=(url??"").split("?")[0]; const m=p.match(/\.([a-z0-9]+)$/i); return m?m[1].toLowerCase():""; }

const KEEP = new Set([
  "76d91711-4f57-4056-b79f-3647a02f0fc1", // 金色蔷薇（回滚 png）
  "c88a7464-b2a2-4a3f-bd0e-a9e2f984f811", // 可爱女仆（保 png）
  "7f7ae62f-4535-42ac-8567-5d0b196e6fa5", // 火花（保 png）
  "58e579b5-4a8e-475f-ae63-34cdda15003c", // 不善女仆（回滚 png）
]);

console.log(`爱弥斯 mod 总数: ${mods.length}`);
console.log(`\n===== 非 webp 图（应仅剩轮播保留的 4 个，且这些应是 png）=====`);
const still = (mods??[]).filter((m)=> (m.images??[]).some((i)=> i && extOf(i)!=="webp"));
for (const m of still) {
  const tag = KEEP.has(m.id) ? "【轮播保留,预期png】" : "⚠️【应转未转】";
  const imgs = (m.images??[]).map((i)=>({u:i,e:extOf(i)}));
  console.log(`\n${tag} [${m.id.slice(0,8)}] ${m.title}\n  ${imgs.map(x=>`${x.e}:${x.u?.slice(-55)}`).join("\n  ")}\n  featured_order=${m.featured_order ?? "-"} is_featured=${m.is_featured}`);
}

console.log(`\n===== 轮播 4 个 mod 封面（images[0]）=====`);
const carousel = (mods??[]).filter((m)=> KEEP.has(m.id));
for (const m of carousel) {
  const c = m.images?.[0];
  console.log(`  [${m.featured_order ?? "-"}] ${m.title.slice(0,24)}\n     ${c?.slice(-70)}\n     ext=${extOf(c)}`);
}

console.log(`\n===== 火花v1.1 详情 =====`);
for (const m of mods) {
  if (/火花v?1\.1/.test(m.title) && !KEEP.has(m.id)) {
    console.log(`  id=${m.id} title=${m.title}`);
    console.log(`  images=\n${(m.images??[]).map(i=>`    ${i}`).join("\n")}`);
    if (m.images?.[0]) {
      const t0=Date.now();
      try {
        const r = await fetch(m.images[0], { signal: AbortSignal.timeout(15000) });
        const b = await r.arrayBuffer();
        console.log(`  可访问: ${r.status} ${(b.byteLength/1048576).toFixed(2)}MB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      } catch(e) { console.log(`  访问失败(${(Date.now()-t0)/1000}s): ${e.name} ${e.message}`); }
    }
  }
}
console.log("\n完成。");
