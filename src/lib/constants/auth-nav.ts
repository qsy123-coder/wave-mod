/**
 * 点击"登录"入口时，头部导航把"当前所在页面"记录到 sessionStorage 的 key。
 *
 * 返回按钮（auth/login-back-button.tsx）读取该 key 直接跳回来源页。
 * 登录页无站点 header，来源页只能在点击入口的这一刻捕获；
 * 用 sessionStorage 而非 state：header 与登录页分属不同布局，走客户端 <Link> 软导航时
 * document.referrer 为空，只有这一处能可靠拿到来源。
 */
export const LOGIN_BACK_KEY = "wave-mod:login-back-target";
