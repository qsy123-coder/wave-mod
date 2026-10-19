import type { Metadata } from "next";
import { Suspense } from "react";

import { ClientProviders } from "@/components/layout/client-providers";
import { LayoutStyleProvider } from "@/components/layout/layout-style-provider";
import { NavigationLoadingProvider } from "@/components/layout/navigation-loading-context";
import { NavigationLoader } from "@/components/layout/navigation-loader";
import { PageLoadingOverlay } from "@/components/layout/page-loading-overlay";
import { RouteChangeListener } from "@/components/layout/route-change-listener";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getCosPublicBaseUrl } from "@/lib/cos/shared";
import { getCosPublicHost } from "@/lib/cos/server-config";
import { getSiteUrl } from "@/lib/site-url";
import { DEFAULT_THEME, THEMES, THEME_COOKIE, THEME_STORAGE_KEY } from "@/lib/theme/constants";
import "./globals.css";

/**
 * 首屏防闪脚本 —— 必须在 `<head>` 里**同步**执行（不能加 async/defer）。
 *
 * 浏览器解析到它时 body 还没开始渲染，所以皮肤类名会在第一次绘制之前就挂好，
 * 用户不会看到「先默认皮肤、再闪成所选皮肤」。
 *
 * 为什么不用更"正统"的服务端方案（在 layout 里 `await cookies()` 然后写进
 * `<html className>`）：那会让**整个站点**从静态渲染退化成动态渲染 ——
 * 这正是 2026 年初 Vercel 额度被打穿的两个根因之一，首页为此专门去掉了
 * `await cookies()`（见 `src/app/(home)/page.tsx` 顶部注释）。内联脚本能达到
 * 同样的零闪烁效果，且页面保持静态。
 *
 * 皮肤清单与 cookie 名都从 `@/lib/theme/constants` 派生，不在这里重复硬编码。
 */
const themeBootstrapScript = `(function(){try{
var KEY=${JSON.stringify(THEME_COOKIE)};
var OK=${JSON.stringify(THEMES)};
var LEGACY=${JSON.stringify(THEME_STORAGE_KEY)};
var DEFAULT=${JSON.stringify(DEFAULT_THEME)};
var t=null;
var parts=document.cookie?document.cookie.split(";"):[];
for(var i=0;i<parts.length;i++){
  var c=parts[i].trim();
  if(c.indexOf(KEY+"=")===0){try{t=decodeURIComponent(c.slice(KEY.length+1));}catch(e){t=null;}break;}
}
if(OK.indexOf(t)<0){try{var l=window.localStorage.getItem(LEGACY);if(OK.indexOf(l)>=0)t=l;}catch(e){}}
if(OK.indexOf(t)<0)t=DEFAULT;
if(t!==DEFAULT){var d=document.documentElement;d.classList.remove.apply(d.classList,OK);d.classList.add(t);}
}catch(e){}})();`;

export const metadata: Metadata = {
  // 让各页可以写相对 canonical / OG 地址（Next 会用它拼成绝对地址）。
  // 不设的话相对地址会退化成 http://localhost:3000，canonical 就指错域名了。
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "星澜资源站",
    template: "%s | 星澜资源站",
  },
  description: "专注角色外观资源整理，提供高清预览、安装指引与高速直链下载。",
  // 全站去索引。子页没写 robots 时会继承这里；写了的话 Next 是**逐字段浅合并**，
  // 子页少写一个字段就会把这里的值覆盖掉（`/mods/[id]` 因此显式写全了两个字段）。
  //
  // 刻意**不**用 `await cookies()` / 读请求头的方式做这件事：那会让整站从静态渲染
  // 退化成动态渲染，正是 2026 年初额度被打穿的根因之一（见文件顶部主题脚本那段注释）。
  // 纯静态 metadata 一样能输出 <meta name="robots" content="noindex, nofollow">。
  //
  // 与 robots.txt 的分工：这里负责「可抓取但不收录」；robots.txt 刻意**不写**
  // `Disallow: /` —— 那样爬虫读不到 noindex，已收录的 URL 反而会永远留在索引里。
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 图片/视频实际取流的是 CDN 域名（配了 NEXT_PUBLIC_COS_IMAGE_BASE 时）；
  // 没配才退回 COS 源站。未配 COS_BUCKET / COS_REGION 时为 null（本地开发），不输出预连接标签。
  const rawCosHost = getCosPublicHost();
  const cosOrigin =
    getCosPublicBaseUrl() ?? (rawCosHost ? `https://${rawCosHost}` : null);

  return (
    <html
      lang="zh-CN"
      className={`${DEFAULT_THEME} h-full scroll-smooth antialiased`}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        {/* suppressHydrationWarning：脚本会在水合前改掉 <html> 的 class，
            水合时 React 看到的 className 与它记录的不一致，需显式静音。 */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {/* 图片全在 COS 上，是**另一个域名**。慢链路上「DNS 4s + TCP 4.5s + TLS 5s」
            才是首屏图片的真正成本（2026-10-16 实测），而不是图片字节数 ——
            452KB 的原图缩到 960px 只省下几十 KB，但一次握手就是好几秒。
            preconnect 让这套连接在 HTML 还在下载时就并行建好，不用等解析到 <img>。
            dns-prefetch 给不支持 preconnect 的浏览器兜底。
            ⚠️ 不要加 crossOrigin：站里的图是普通 <img>（no-cors），带 crossOrigin
            的预连接走的是另一条连接池，复用不上，等于白预连。 */}
        {cosOrigin ? <link rel="preconnect" href={cosOrigin} /> : null}
        {cosOrigin ? <link rel="dns-prefetch" href={cosOrigin} /> : null}
      </head>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <LayoutStyleProvider>
            <ClientProviders>
              <NavigationLoadingProvider>
                {children}
                <PageLoadingOverlay />
                <Suspense fallback={null}>
                  <RouteChangeListener />
                </Suspense>
              </NavigationLoadingProvider>
              <Suspense fallback={null}>
                <NavigationLoader />
              </Suspense>
              <Toaster position="top-center" richColors />
            </ClientProviders>
          </LayoutStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
