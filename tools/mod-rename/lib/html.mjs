/**
 * 首页 HTML 的 token 注入。
 *
 * 为什么要注入：静态页里的 `/style.css`、`/app.js` 是浏览器自己发的子请求，
 * 不会带 `x-rename-token` 头。鉴权挡住它们的结果是「HTML 正常、JS/CSS 全 403」——
 * 页面看起来一片空白，但服务端日志里全是 200，最难查的那类问题（2026-11-01 实测踩到）。
 */
export function injectToken(html, token) {
  if (!token) return html;
  return String(html)
    .replace(/href="\/style\.css"/g, `href="/style.css?t=${token}"`)
    .replace(/src="\/app\.js"/g, `src="/app.js?t=${token}"`);
}
