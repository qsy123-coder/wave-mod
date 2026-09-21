/**
 * 站内 URL 等价判定，用来识别「原地踏步」的导航：点击的目标就是浏览器当前所在的 URL。
 *
 * 为什么非要判这一下：列表页的骨架屏结束**只能**由「服务端 props 变化」触发
 * （见 mods-page-client.tsx 的 useEffect），而 push 一个与当前相同的 URL 不会
 * 带来任何 props 变化。于是「点当前已选中的角色分类 / 选当前排序 / 重复搜索同一个词」
 * 这三个动作会把骨架屏永久点亮，只能刷新页面才能恢复（2026-09-21 用户报告）。
 *
 * 顶部导航早就有这个防护（site-header-client.tsx 里那句 `href === currentUrl`），
 * 侧边栏与工具栏此前没有 —— 判定逻辑抽到这里，三处口径一致。
 *
 * 比较的是**语义**而不是字符串：`?a=1&b=2` 与 `?b=2&a=1`、`/mods?` 与 `/mods`、
 * 同一个中文值的不同百分号编码，都必须判为同一个 URL。
 */

/** 路径去掉尾斜杠（根路径除外）；查询串按参数名排序后重新拼接 */
function normalizeUrl(url: string): string {
  const queryIndex = url.indexOf("?");
  const rawPath = queryIndex < 0 ? url : url.slice(0, queryIndex);
  const rawSearch = queryIndex < 0 ? "" : url.slice(queryIndex + 1);

  // URLSearchParams 会解码后按键取值，编码差异（%E7%88%B1 vs 原文）在这里被抹平。
  // 键与值一起排序：同名参数（?tag=a&tag=b）的顺序差异同样不算差异。
  const params = [...new URLSearchParams(rawSearch).entries()].sort(([keyA, valueA], [keyB, valueB]) =>
    keyA === keyB ? (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) : keyA < keyB ? -1 : 1
  );

  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  return `${path}?${params.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

/** 两个站内 URL 是否指向同一页同一组筛选条件 */
export function isSameNavigationUrl(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

/**
 * 目标 href 是否就是浏览器当前所在的 URL。
 * 只能在事件处理里调用（需要 window）；判定为真时调用方应直接返回，
 * 不要 push、也不要开骨架屏。
 */
export function isCurrentNavigationUrl(href: string): boolean {
  return isSameNavigationUrl(href, `${window.location.pathname}${window.location.search}`);
}
