/**
 * MOD 详情页的分享链接。
 *
 * 只拼「规范域名 + /mods/<id>」：地址栏里的 `/mods/<id>?character=千咲` 是本地筛选
 * 状态，跟着分享出去会让对方的列表被一起带偏；而 `go.sunnyrose.xyz` 之外的旧域名
 * 目前是 410（memory: wavemod-site-shutdown-410），所以域名一律由 getSiteUrl() 给，
 * 不要用 window.location.origin。
 *
 * 抽成纯函数是为了能在 vitest（node 环境）里直接测 —— 项目没有 jsdom，
 * 组件里的交互只能靠 CDP 手工验收。
 */
export function buildModShareUrl(siteUrl: string, modId: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/mods/${encodeURIComponent(modId)}`;
}
