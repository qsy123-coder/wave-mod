/**
 * 跨客户端导航记住某个滚动容器的位置。
 *
 * 为什么需要：`/mods` 的角色侧栏和筛选视图分属 Suspense 边界内外的两棵树
 * （见 mods-listing.tsx），点一次角色分类 = 一次 searchParams 导航，边界会把
 * 整棵列表子树换成另一棵 —— 侧栏那个 `overflow-y-auto` 容器是**新建的 DOM 节点**，
 * scrollTop 必然回到 0，用户看到的就是「点一下分类，侧栏跳回最上面」。
 *
 * 记忆放在模块作用域：只活在这个标签页的 JS 运行期里，刷新 / 新开标签自然归零，
 * 这正是想要的语义（重新打开页面应该从头看）。服务端不写这份状态 ——
 * 两个写入口都只在浏览器事件里（挂载 ref / onScroll），SSR 时不触发。
 */

const positions = new Map<string, number>();

/** 记下某个键的滚动位置。NaN / 负数 / Infinity 一律不写，避免脏值把侧栏顶到莫名其妙的地方。 */
export function rememberScrollPosition(key: string, top: number): void {
  if (!Number.isFinite(top) || top < 0) return;
  positions.set(key, top);
}

/** 取回某个键的滚动位置；没记过就返回 0（即「从头开始」）。 */
export function recallScrollPosition(key: string): number {
  return positions.get(key) ?? 0;
}
