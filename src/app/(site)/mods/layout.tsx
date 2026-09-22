import { Suspense } from "react";

import { NavigationLoadingProvider } from "@/components/layout/navigation-loading-context";
import { NavigationProgress } from "@/components/layout/navigation-progress";

export default function ModsLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigationLoadingProvider>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {/*
        外壳高度必须减掉**站点头部的实测高度**（--site-header-h，由 site-header 的
        ResizeObserver 写入，SSR 兜底 104px），不能写死数值。
        以前写死 60px，而真头部有 ~100px：文档于是比视口高出 40px 左右，刷新时浏览器
        还原这个滚动偏移、BodyScrollLock 又把它锁住，整块内容就永久上移、藏在 sticky
        头部（z-50）底下 —— 2026-09-22 用户报告「切换布局后刷新，导航栏下面的区域会
        往上跑并出现在导航栏下面」。
        用 dvh 而不是 vh：移动端 vh 是不含地址栏的最大高度，同样会多出一截。
      */}
      <div className="flex h-[calc(100dvh-var(--site-header-h))] flex-col overflow-hidden">
        <div className="flex flex-1 gap-6 overflow-hidden py-3">
          {children}
        </div>
      </div>
    </NavigationLoadingProvider>
  );
}
