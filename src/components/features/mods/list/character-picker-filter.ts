import type { CharacterSidebarItem } from "./character-sidebar";

/**
 * 「全部角色分类」抽屉的搜索过滤。
 *
 * 抽成纯函数而不是写在组件里，是因为它是本功能唯一有分支的逻辑（归一化、空白查询、
 * 无匹配），组件本身只是把结果铺出来；放这里就能用单测把口径钉死。
 *
 * 只做**本地**过滤：抽屉拿到的已经是完整的 66 项（服务端算好的），搜索不需要请求
 * 后端，也不该改 URL —— 它回答的是「列表里哪一项叫什么」，不是筛选资源。
 */

/**
 * 查询归一化：NFKC（全角转半角）→ 去首尾空格 → 小写。
 *
 * NFKC 是为了手机输入法打出的全角 `ＳＫＩＮＳ` 也能命中英文分类；
 * 小写只影响英文分类名（Skins / UI / Other/Misc），中文不受影响。
 */
export function normalizeCharacterSearchQuery(query: string): string {
  return query.normalize("NFKC").trim().toLowerCase();
}

/**
 * 按 label 做子串匹配，保持入参顺序（顺序本身有含义：按角色首发日期倒序）。
 *
 * 空查询返回**新的**数组而不是入参：调用方拿到的东西不该和 props 是同一个引用，
 * 否则以后有人就地 push/sort 会悄悄改到上游的数据。
 */
export function filterCharacterPickerItems<T extends Pick<CharacterSidebarItem, "label">>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = normalizeCharacterSearchQuery(query);
  if (!needle) return items.slice();

  return items.filter((item) =>
    item.label.normalize("NFKC").toLowerCase().includes(needle),
  );
}
