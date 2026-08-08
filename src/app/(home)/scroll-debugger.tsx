"use client";

import { useEffect } from "react";

/**
 * 滚动调试器：监听 SnapContainer 滚动，输出关键数据到控制台。
 * 任务完成后删除此组件。
 */
export function ScrollDebugger() {
  useEffect(() => {
    const container = document.querySelector<HTMLDivElement>(
      "[data-scroll-container]",
    );
    if (!container) {
      console.warn("[ScrollDebugger] 未找到 data-scroll-container");
      return;
    }

    const log = (label: string, data: Record<string, unknown>) => {
      console.log(
        `%c[ScrollDebugger] %c${label}`,
        "color:#ffb000;font-weight:bold",
        "color:inherit",
        data,
      );
    };

    const onScroll = () => {
      const scrollTop = container.scrollTop;
      const vh = container.clientHeight;
      const totalScroll = container.scrollHeight;
      const section1 = container.children[0] as HTMLElement | undefined;
      const section2 = document.getElementById("snap-section-2");
      const header = document.querySelector<HTMLElement>("header");
      const section2Top = section2?.offsetTop ?? 0;
      const section2Rect = section2?.getBoundingClientRect();

      // 图片容器（ZenlessHeroCarouselClient 内部的绝对定位 div）
      const imgContainer = section2?.querySelector<HTMLElement>(
        ".absolute.inset-x-0",
      );

      log("scroll", {
        scrollTop,
        vh,
        totalScroll,
        section1Height: section1?.offsetHeight,
        section2Top,
        section2RectTop: section2Rect?.top,
        section2RectBottom: section2Rect?.bottom,
        imgContainerTop: imgContainer?.getBoundingClientRect().top,
        imgContainerHeight: imgContainer?.offsetHeight,
        headerHeight: header?.offsetHeight,
        headerGlass: document.documentElement.getAttribute("data-header-glass"),
        currentSection: scrollTop < vh * 0.5 ? "区域1" : "区域2",
        snapProgress:
          section2Top > 0
            ? `${((scrollTop / section2Top) * 100).toFixed(1)}%`
            : "N/A",
      });
    };

    // 节流
    let ticking = false;
    const onScrollThrottled = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          onScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener("scroll", onScrollThrottled, { passive: true });

    // 初始状态
    onScroll();

    return () => container.removeEventListener("scroll", onScrollThrottled);
  }, []);

  return null;
}
