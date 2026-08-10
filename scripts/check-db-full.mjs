import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Fetch ALL mods with pagination
async function fetchAll() {
  let all = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("mods")
      .select("character, title, created_at")
      .eq("game_key", "wuthering-waves")
      .eq("is_available", true)
      .order("character")
      .range(from, from + limit - 1);
    if (error) { console.error(error); return all; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < limit) break;
    from += limit;
  }
  return all;
}

const all = await fetchAll();
console.log(`Total mods fetched: ${all.length}`);

const byChar = {};
for (const m of all) {
  if (!byChar[m.character]) byChar[m.character] = [];
  byChar[m.character].push(m.title);
}

console.log("\n=== Database mods by character ===");
for (const [char, mods] of Object.entries(byChar).sort()) {
  console.log(`${char}: ${mods.length}`);
}

// Check old characters
console.log("\n=== Previously uploaded characters ===");
const oldChars = ["弗洛洛", "洛瑟菈", "卡提希娅", "椿", "绯雪"];
for (const c of oldChars) {
  const count = byChar[c]?.length || 0;
  if (count === 0) {
    // Try to query directly
    const { data } = await supabase
      .from("mods")
      .select("title, character, is_available")
      .eq("character", c)
      .eq("game_key", "wuthering-waves")
      .order("created_at", { ascending: false })
      .limit(5);
    console.log(`${c}: ${count} mods (direct query: ${data?.length || 0}, is_available check)`);
    if (data?.length > 0) {
      for (const m of data) console.log(`  - ${m.title} (is_available=${m.is_available})`);
    }
  } else {
    console.log(`${c}: ${count} mods`);
  }
}
