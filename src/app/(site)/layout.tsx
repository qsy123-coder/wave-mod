import { Suspense } from "react";

import { ConditionalFooter } from "@/components/layout/conditional-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteHeaderSkeleton } from "@/components/layout/site-header-skeleton";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
      min-h-dvh 而不是 min-h-screen：dvh 才是**实际可见**的视口高度。
      移动端 100vh 是不含地址栏的最大高度，比可见区域高一截；而 /mods 应用壳的
      高度是「100dvh - 头部高度」，若父层硬按 100vh 撑开，底部就会多出一段空白可
      滚动，刷新时浏览器还原那个偏移 —— 又绕回「内容上移、藏到导航栏底下」。
      内容页都比视口高，min-height 根本不起作用，所以这个改动只影响短页面。
    */
    <div className="min-h-dvh bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px]">
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">{children}</main>
      <ConditionalFooter />
    </div>
  );
}
