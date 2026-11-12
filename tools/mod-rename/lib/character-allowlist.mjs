/**
 * 命名工坊的「角色白名单」构造：库内 distinct ∪ 站内已登记角色。
 *
 * 为什么不能只用库内 distinct（原来的做法）——**新角色的第一条 mod 永远过不了校验**：
 * plan.mjs 用这份集合判断「库里没有这个角色 ⇒ 落地会凭空多一个分类」，而新角色
 * 恰恰要先入库才进得了 distinct，于是鸡生蛋。
 * 2026-11-12 莉莉（3.8 上半）就卡在这里：代码里已登记、库内 0 条，改不了名。
 *
 * 也不能只用站内角色表：它是**手写清单**，永远滞后于库（库里实际有 `武器`、
 * `怪物`、`滑翔翼,翱翔翼,科考摩托` 这些不在表里的合法分类，还有历史别名）。
 * 两边取并集，任一侧认识就算合法。
 *
 * 抽成纯函数是为了能写单测：db.mjs 在模块加载时会连库，测试里 import 它会卡 15 秒。
 */

/**
 * @param {object} args
 * @param {Iterable<string>|null} args.dbCharacters 库内 distinct character；null = 读库失败
 * @param {Iterable<string>|null} [args.registeredCharacters] 站内已登记的角色名（characterImageMap 的 key）
 * @param {(value: string) => string} [args.normalize] 角色名归一化（别名 → 标准名）
 * @returns {Set<string>|null} 读库失败且没有已登记清单时返回 null（调用方据此降级成「未校验」）
 */
export function buildCharacterAllowlist({ dbCharacters, registeredCharacters, normalize } = {}) {
  const fold = typeof normalize === "function" ? normalize : (value) => value;
  const allowlist = new Set();

  const addAll = (source) => {
    if (!source) return 0;
    let added = 0;
    for (const raw of source) {
      const name = fold(String(raw ?? "").trim());
      if (!name || allowlist.has(name)) continue;
      allowlist.add(name);
      added++;
    }
    return added;
  };

  addAll(registeredCharacters);
  addAll(dbCharacters);

  // 读库失败（dbCharacters 为 null/undefined）但站内登记表在：仍然比「什么都不校验」好。
  // 两边都没有才是真的无从校验 ⇒ null。
  if (dbCharacters == null && allowlist.size === 0) return null;

  return allowlist;
}
