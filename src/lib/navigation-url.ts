/**
 * 列表页筛选 URL 的两半：**拼链接**（buildModsFilterHref）与**判等**
 * （isSameNavigationUrl / isCurrentNavigationUrl）。放一个文件里，是因为两者必须
 * 讲同一套参数约定 —— 拼出来的链接马上要拿去跟当前 URL 比，规则分家就会误判。
 *
 * 下面先说判等。
 *
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

export type ModsFilterParams = {
  query?: string;
  character?: string;
  sort?: string;
  /** 只看有直链下载的（download_url） */
  direct?: boolean;
  /** 只看有真预览图的（排除占位图） */
  preview?: boolean;
};

/**
 * 拼列表页筛选链接。列表页的筛选维度 query / character / sort / direct / preview
 * 全在 URL 上，所以「不传（或传空串/false）的字段」就等于**该筛选被取消** ——
 * 提交搜索与「叉掉某个筛选」因此共用这一条路径，不会各写一份参数约定。
 *
 * 两个布尔开关固定写成 "1"（不写 "true"），服务端认这个值（parseModFlag）；
 * 判等那边（normalizeUrl）比的是解出来的值，所以链接里写成别的形式也不会误判成不同页。
 *
 * sort 为 "latest" 时省略：服务端把「没写 sort」当作最新的默认值，显式写出来只是让
 * URL 变长。这条省略规则与侧边栏链接（buildModsHref）保持一致 —— 否则同一个页面会
 * 出现两个「语义相同、字符串不同」的链接。
 */
export function buildModsFilterHref(
  basePath: string,
  { query, character, sort, direct, preview }: ModsFilterParams
): string {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (character) params.set("character", character);
  if (sort && sort !== "latest") params.set("sort", sort);
  if (direct) params.set("direct", "1");
  if (preview) params.set("preview", "1");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
