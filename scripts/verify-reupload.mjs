/** 验证回传结果：剩余下线 MOD 清单 + 抽查几个刚上传的图片 URL 是否 200 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { count, error } = await supabase
  .from("mods").select("id", { count: "exact", head: true })
  .eq("is_published", false);
console.log(`\n剩余下线 MOD 总数: ${count}${error ? ` (ERR ${error.message})` : ""}`);

const { data } = await supabase
  .from("mods").select("title, id, images")
  .eq("is_published", false)
  .limit(50);
if (data?.length) {
  console.log("--- 仍下线 ---");
  data.forEach((m) => console.log(`   ${m.title}`));
} else {
  console.log("（无）");
}

// 抽查刚回传的图片 URL 是否可访问（200）
const { data: samples } = await supabase
  .from("mods")
  .select("title, images")
  .eq("is_published", true)
  .in("title", ["时韵v1.12 by 狩野樱（上下左右？。切换）", "逆兔女仆", "SM培训专家 by MeetFlab（ctrl+？切换）", "定制-完整版 by KatTDev（alt+6切换）"])
  .limit(5);
console.log("\n--- 抽查图片 URL ---");
for (const m of samples ?? []) {
  const url = m.images?.[0];
  if (!url) { console.log(`   ${m.title}: 无图片`); continue; }
  const res = await fetch(url, { method: "HEAD" });
  console.log(`   ${res.status} ${m.title}  ${url}`);
}
