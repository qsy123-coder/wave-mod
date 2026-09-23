import { ConditionalFooter } from "@/components/layout/conditional-footer";
import { SiteHeader } from "@/components/layout/site-header";

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
      {/*
        这里以前是 <Suspense fallback={<SiteHeaderSkeleton />}><SiteHeader /></Suspense>。
        不再需要：那个边界的唯一作用是接住 `getCurrentUser()` 的挂起，而登录态已经
        搬到客户端（见 session-provider.tsx），header 不再读 cookie、也不再挂起。

        更要紧的是**留着它有害**：Suspense 边界会让 Next 把 pre-render 结果写成
        「先吐骨架、真内容藏在后面的 <div hidden id="S:0">、再由内联脚本换入」——
        真内容确实在同一份 HTML 里（爬虫和慢网络都不会丢），但首帧会先画出骨架屏。
        去掉边界后导航栏直接进静态外壳，没有骨架、没有换入。
      */}
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">{children}</main>
      <ConditionalFooter />
    </div>
  );
}
