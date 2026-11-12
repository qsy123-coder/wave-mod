/**
 * 只读数据库：拿「库内角色清单」和「已有去重键」。
 *
 * 走 `scripts/psql-db.mjs`（psql 直连，不是 supabase-js），原因见那个文件头：
 * Supabase REST 网关曾经 402 锁死，psql 直连才是稳的。
 * 连不上不抛给页面 —— 分类校验降级成「未校验」，绝不让工具因为库挂了无法改名。
 *
 * ── 角色白名单 = 库内 distinct ∪ 站内已登记角色（2026-11-12）─────────────────
 *
 * 只用库内 distinct 会让**新角色的第一条 mod 永远过不了校验**：plan.mjs 用这份集合
 * 判断「库里没有 ⇒ 会凭空多一个分类」，而新角色恰恰要先入库才进得了 distinct。
 * 莉莉（3.8 上半，2026-11-12）就卡在这里：代码里已登记、库内 0 条、工坊不让改名。
 * 并上 characterImageMap 的 key 之后，任一侧认识就算合法。构造逻辑见
 * character-allowlist.mjs（纯函数，有单测）。
 */
import { psqlJson } from "../../../scripts/psql-db.mjs";

import { dedupKey, normalizeCharacter } from "../../../scripts/daily-classify.mjs";

import { buildCharacterAllowlist } from "./character-allowlist.mjs";

const CACHE_MS = 60_000;
let cache = { at: 0, value: null };

/**
 * 站内已登记的角色名（`characterImageMap` 的 key）。
 *
 * 直接 import `.ts` 靠 Node 的类型剥离（Node 22.6+ 实验特性、23.6+ 默认开启；
 * 本机 26 实测可用）。老 Node 上会抛 ERR_UNKNOWN_FILE_EXTENSION —— 那种情况
 * 不能把整个工坊带崩，退化成「只用库内 distinct」（改动前的行为）。
 *
 * 缓存到模块级：这份表是静态的，没必要每次读 60 秒缓存时都重新解析一遍 TS。
 */
let registeredCharacters;
async function loadRegisteredCharacters() {
  if (registeredCharacters !== undefined) return registeredCharacters;

  try {
    // 唯一源头：src/lib/constants/character-registry.ts 的 CHARACTER_AVATARS。
    // 加角色只改那一个文件，工坊 / 后台 / 前台全部自动跟随。
    const mod = await import("../../../src/lib/constants/character-registry.ts");
    registeredCharacters = new Set(Object.keys(mod.CHARACTER_AVATARS ?? {}));
  } catch (err) {
    registeredCharacters = null;
    console.warn(
      `⚠️  读不到站内角色表（${String(err.message ?? err).split("\n")[0]}），` +
        "白名单退化成只用库内 distinct —— 新角色仍会被拦。",
    );
  }
  return registeredCharacters;
}

/** @returns {{knownCharacters:Set<string>|null, existingDedup:Set<string>|null, error:string}} */
export async function loadKnownMods({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  const registered = await loadRegisteredCharacters();

  try {
    const rows = await psqlJson(
      `select coalesce(json_agg(json_build_object('character', character, 'title', title)), '[]'::json)::text from mods;`
    );
    const list = Array.isArray(rows) ? rows : [];
    const dbCharacters = new Set();
    const existingDedup = new Set();
    for (const r of list) {
      if (!r?.character) continue;
      // 与读取侧（src/lib/mods-domain/public.ts）和上传脚本同一口径：先归一化再入集合。
      // 库里有历史别名值（`陆赫斯` / `路赫斯` 并存），不归一的话去重键会和脚本算出来的对不上。
      const character = normalizeCharacter(String(r.character).trim());
      dbCharacters.add(character);
      existingDedup.add(dedupKey(character, r.title ?? ""));
    }

    // 白名单在 normalize 之后构建：别名（陆赫斯）不会额外占一个分类名额。
    const knownCharacters = buildCharacterAllowlist({
      dbCharacters,
      registeredCharacters: registered,
      normalize: normalizeCharacter,
    });

    cache = { at: Date.now(), value: { knownCharacters, existingDedup, error: "" } };
    return cache.value;
  } catch (err) {
    // 读库失败也要带上站内登记表：至少新登记过的角色还能改名，
    // 比整份白名单变 null（plan.mjs 会降级成「未校验」）更有用。
    const knownCharacters = buildCharacterAllowlist({
      dbCharacters: null,
      registeredCharacters: registered,
      normalize: normalizeCharacter,
    });
    const value = {
      knownCharacters,
      existingDedup: null,
      error: `读库失败：${String(err.message ?? err).split("\n")[0]}`,
    };
    cache = { at: Date.now(), value }; // 失败也缓存，避免每点一次都卡 15 秒
    return value;
  }
}
