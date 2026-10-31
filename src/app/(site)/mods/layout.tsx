import { Suspense } from "react";

import { ModsShell } from "@/components/features/mods/list/mods-shell";
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
        ResizeObserver 写入，SSR 兜底 76px），不能写死数值。
        以前写死 60px，而真头部有 ~100px：文档于是比视口高出 40px 左右，刷新时浏览器
        还原这个滚动偏移、BodyScrollLock 又把它锁住，整块内容就永久上移、藏在 sticky
        头部（z-50）底下 —— 2026-09-22 用户报告「切换布局后刷新，导航栏下面的区域会
        往上跑并出现在导航栏下面」。
        用 dvh 而不是 vh：移动端 vh 是不含地址栏的最大高度，同样会多出一截。
      */}
      <ModsShell>
        {/*
          底部不再留 py-3 的褐色空隙：那一条 12px 的底色正好落在滚动容器与视口边界的交界处，
          卡片滑到那里就被硬切一刀，白底 + 褐色形成一个"没做完"的难看横线。
          现在容器一直铺到视口底部，再由下面那条不透明的装饰线压住最后 12px ——
          卡片是从线后面滑过去的，交界处只剩一条设计好的黑/黄边。
        */}
        <div className="flex flex-1 gap-6 overflow-hidden pt-3">
          {children}
        </div>
        {/* fixed 是为了横跨整个视口（main 有 max-w 与左右 padding，absolute 会在两侧留褐色边） */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-3 border-t-4 border-black bg-[var(--neo-nav)]"
        />
      </ModsShell>
    </NavigationLoadingProvider>
  );
}
