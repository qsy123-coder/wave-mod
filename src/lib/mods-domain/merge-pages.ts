/**
 * 无限滚动的多页合并：按 id 去重，保留**最先出现**的那一条。
 *
 * 为什么必须去重（2026-11-03 角色分类页「瀑布流下面又出现空白」）：
 *
 * `/api/mods` 是**逐页**缓存的（每页一条 `unstable_cache`，TTL 12 小时），而它切的是
 * 同一份「按 created_at 排好的整表」。整表在两次填缓存之间变过的时候，第 1 页和第 2 页
 * 就来自两份不同的快照 —— 实测线上：第 1 页（服务端种子）与第 2 页重叠了 7 条，
 * 另有 7 条被跳过。每日上传会把老记录的 created_at 推到目录日期（CLAUDE.md 里的
 * 「重新上架」），整表顺序因此整体平移，正是这种快照错位最常见的触发方式。
 *
 * 不去重的后果不是「多一张卡」而是**整块空白**：瀑布流用 id 当 Map 键排位置
 * （见 masonry-packing.ts 的 packMasonry），重复 id 会让先出现的那次位置被覆盖丢失，
 * 卡片只落在后一次的位置上，前一格就永久空着。同一条 id 还会被渲染两次（React 同 key）。
 *
 * 去重后页数不变、`hasMore` 照旧：重复的那几格不会再占位，后续页继续往下接。
 */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

/** 把多页拍平成一条列表并去重（顺序与分页顺序一致，重复项保留第一次出现的位置）。 */
export function mergePagesById<T extends { id: string }>(pages: readonly (readonly T[])[]): T[] {
  return uniqueById(pages.flat());
}
