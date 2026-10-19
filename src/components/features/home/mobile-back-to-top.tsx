"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 滚过这么远才显示。
 *
 * 没滚过首屏时不该有按钮压在内容上 —— 手机端首屏是品牌卡 + 角色分类，
 * 按钮固定在最上方会挡住刚打开的页面。
 */
const SHOW_AFTER_PX = 480;

/**
 * 手机端首页的「回到顶部」。
 *
 * 与 `/mods` 的实现（`mods-page-client.tsx`）不同：首页手机端滚动的是**窗口**，
 * 桌面端的首页则滚 `SnapContainer` 那个内层容器、窗口本身不动。所以这里监听
 * `window.scrollY`，并用 `(max-width: 767px)` 兜底 —— 桌面宽度下即使有人手动
 * 改了 `md:hidden` 的父级，状态也不会亮起来。
 *
 * 位置固定在站点头部之下（`--site-header-h` 由 site-header 的 ResizeObserver 实测写入），
 * 水平居中；`z-40` 在卡片之上、头部/弹层（z-50）之下，与 `/mods` 的层级口径一致。
 */
export function MobileBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setVisible(media.matches && window.scrollY > SHOW_AFTER_PX);
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    // 系统开了「减少动态效果」就别做平滑滚动
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  return (
    <div
      data-slot="mobile-back-to-top"
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--site-header-h,0px)+10px)] z-40 flex justify-center md:hidden"
    >
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="回到顶部"
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        className={cn(
          "inline-flex items-center gap-1 border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition duration-200",
          visible
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        <ArrowUp className="size-3.5" strokeWidth={3} />
        回到顶部
      </button>
    </div>
  );
}
