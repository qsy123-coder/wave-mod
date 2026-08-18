import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { count, error } = await supabase.from("mods").select("id", { count: "exact", head: true }).eq("is_published", true);
console.log("已发布:", count, error?.message ?? "");
const { count: total } = await supabase.from("mods").select("id", { count: "exact", head: true });
console.log("总数:", total);
