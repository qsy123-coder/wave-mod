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

const { data: all, error } = await supabase
  .from("mods")
  .select("character, title, created_at")
  .eq("game_key", "wuthering-waves")
  .eq("is_available", true)
  .order("character");

if (error) { console.error(error); process.exit(1); }

const byChar = {};
for (const m of all) {
  if (!byChar[m.character]) byChar[m.character] = [];
  byChar[m.character].push(m.title);
}

console.log("=== Database mods by character ===");
let total = 0;
for (const [char, mods] of Object.entries(byChar).sort()) {
  console.log(char + ": " + mods.length);
  total += mods.length;
}
console.log("Total: " + total);

// Check for the old characters that were uploaded before
console.log("\n=== Previously uploaded characters ===");
const oldChars = ["弗洛洛", "洛瑟菈", "卡提希娅", "椿", "绯雪"];
for (const c of oldChars) {
  console.log(c + ": " + (byChar[c] ? byChar[c].length : 0) + " mods");
}

// Characters with CSV that have 0 mods in DB
console.log("\n=== Characters with CSV but 0 mods ===");
const csvChars = [
  "丽贝卡","仇远","今汐","凌阳","千咲","卡卡罗","反虚化，ui界面，场景，葫芦，特效等",
  "吟霖","嘉贝莉娜","夏空","奥古斯塔","女漂","守岸人","尤诺","忌炎","折枝","散华",
  "桃祈","洛可可","滑翔翼,翱翔翼,科考摩托","玄翎","珂莱塔","相里要","秧秧","维里奈",
  "莫宁","莫特斐","菲比","西格莉卡","赞妮","达妮娅","鉴心","陆赫斯","露帕","露西"
];
for (const c of csvChars) {
  if (!byChar[c] || byChar[c].length === 0) {
    console.log("  MISSING: " + c);
  }
}
