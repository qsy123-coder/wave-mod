/**
 * `/gamebanana` 的应用壳，与 `/mods/layout.tsx` 同一套高度算法。
 *
 * 外壳高度必须减掉**站点头部的实测高度**（`--site-header-h`，由 site-header 的
 * ResizeObserver 写入，SSR 兜底 104px），不能写死数值 —— 写死会让文档比视口高出一截，
 * 刷新时浏览器还原那个滚动偏移、`BodyScrollLock` 又把它锁住，整块内容就永久上移到
 * sticky 头部底下（2026-09-22 用户报告过）。用 dvh 同理：移动端 vh 不含地址栏。
 *
 * 这里比 `/mods` 少一层 `NavigationLoadingProvider` + `NavigationProgress`：
 * 顶部进度条的唯一写入口是网格的取数状态，而本页筛选全在本地算，没有取数这回事。
 * Provider 本身由根布局提供（app/layout.tsx），header 里的消费方不受影响。
 */
export default function GamebananaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-var(--site-header-h))] flex-col overflow-hidden">
      <div className="flex flex-1 gap-6 overflow-hidden py-3">{children}</div>
    </div>
  );
}
