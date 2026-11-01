/**
 * 只读数据库：拿「库内角色清单」和「已有去重键」。
 *
 * 走 `scripts/psql-db.mjs`（psql 直连，不是 supabase-js），原因见那个文件头：
 * Supabase REST 网关曾经 402 锁死，psql 直连才是稳的。
 * 连不上不抛给页面 —— 分类校验降级成「未校验」，绝不让工具因为库挂了无法改名。
 */
import { psqlJson } from "../../../scripts/psql-db.mjs";

import { dedupKey } from "../../../scripts/daily-classify.mjs";

const CACHE_MS = 60_000;
let cache = { at: 0, value: null };

/** @returns {{knownCharacters:Set<string>|null, existingDedup:Set<string>|null, error:string}} */
export async function loadKnownMods({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  try {
    const rows = await psqlJson(
      `select coalesce(json_agg(json_build_object('character', character, 'title', title)), '[]'::json)::text from mods;`
    );
    const list = Array.isArray(rows) ? rows : [];
    const knownCharacters = new Set();
    const existingDedup = new Set();
    for (const r of list) {
      if (!r?.character) continue;
      knownCharacters.add(r.character);
      existingDedup.add(dedupKey(r.character, r.title ?? ""));
    }
    cache = { at: Date.now(), value: { knownCharacters, existingDedup, error: "" } };
    return cache.value;
  } catch (err) {
    const value = {
      knownCharacters: null,
      existingDedup: null,
      error: `读库失败：${String(err.message ?? err).split("\n")[0]}`,
    };
    cache = { at: Date.now(), value }; // 失败也缓存，避免每点一次都卡 15 秒
    return value;
  }
}
