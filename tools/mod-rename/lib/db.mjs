/**
 * 只读数据库：拿「库内角色清单」和「已有去重键」。
 *
 * 走 `scripts/psql-db.mjs`（psql 直连，不是 supabase-js），原因见那个文件头：
 * Supabase REST 网关曾经 402 锁死，psql 直连才是稳的。
 * 连不上不抛给页面 —— 分类校验降级成「未校验」，绝不让工具因为库挂了无法改名。
 */
import { psqlJson } from "../../../scripts/psql-db.mjs";

import { dedupKey, normalizeCharacter } from "../../../scripts/daily-classify.mjs";

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
      // 与读取侧（src/lib/mods-domain/public.ts）和上传脚本同一口径：先归一化再入集合。
      // 库里有历史别名值（`陆赫斯` / `路赫斯` 并存），不归一的话去重键会和脚本算出来的对不上。
      const character = normalizeCharacter(String(r.character).trim());
      knownCharacters.add(character);
      existingDedup.add(dedupKey(character, r.title ?? ""));
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
