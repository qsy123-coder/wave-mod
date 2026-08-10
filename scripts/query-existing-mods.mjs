/**
 * Query existing mods from Supabase, grouped by character.
 * Compares against local CSV files to find mods that need upload.
 *
 * Usage: node scripts/query-existing-mods.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

// Load .env.local
const envPath = join(import.meta.dirname, "..", ".env.local");
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Parse CSV files ──
const MODS_DIR = String.raw`D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新`;

function parseCsvFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  // Skip header line
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // CSV format: status,title,shareUrl,extractCode,shareTime
    // Simple split by comma but be careful with quoted fields
    const parts = line.split(",");
    if (parts.length >= 2) {
      const title = parts[1].trim().replace(/^"|"$/g, "");
      const extractCode = parts.length >= 4 ? parts[3].trim() : "";
      entries.push({ title, extractCode });
    }
  }
  return entries;
}

function getLocalModsByCharacter() {
  const result = {};
  const folders = readdirSync(MODS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const folder of folders) {
    const charName = folder.name;
    const csvFiles = readdirSync(join(MODS_DIR, charName)).filter((f) => f.endsWith(".csv"));
    if (csvFiles.length === 0) continue;

    const mods = [];
    for (const csv of csvFiles) {
      mods.push(...parseCsvFile(join(MODS_DIR, charName, csv)));
    }
    result[charName] = mods;
  }
  return result;
}

// ── Main ──
const localMods = getLocalModsByCharacter();
console.log(`Local CSV characters: ${Object.keys(localMods).length}`);
console.log(`Local CSV mod entries: ${Object.values(localMods).reduce((s, m) => s + m.length, 0)}`);

// Query database
const { data: dbMods, error } = await supabase
  .from("mods")
  .select("title, character")
  .eq("game_key", "wuthering-waves")
  .eq("is_available", true);

if (error) {
  console.error("DB query error:", error);
  process.exit(1);
}

console.log(`\nDatabase mods: ${dbMods.length}`);

// Group by character
const dbByChar = {};
for (const m of dbMods) {
  if (!dbByChar[m.character]) dbByChar[m.character] = new Set();
  dbByChar[m.character].add(m.title);
}

// ── Compare ──
console.log("\n=== Characters with CSVs vs Database ===\n");
let totalNew = 0;
for (const [char, mods] of Object.entries(localMods).sort()) {
  const dbSet = dbByChar[char] || new Set();
  const existing = mods.filter((m) => dbSet.has(m.title));
  const missing = mods.filter((m) => !dbSet.has(m.title));

  if (missing.length === 0) {
    console.log(`[SKIP] ${char}: ${mods.length} CSV entries, ALL ${existing.length} already in DB`);
  } else {
    console.log(`[TODO] ${char}: ${mods.length} CSV entries, ${existing.length} in DB, ${missing.length} NEW`);
    totalNew += missing.length;
  }
}

console.log(`\n---`);
console.log(`Total new mods to upload: ${totalNew}`);
