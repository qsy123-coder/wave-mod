"use client";

import { useEffect } from "react";

/**
 * 监听区域 2 是否进入视口，当用户滚动到第二屏时，
 * 给 <html> 添加 data-header-glass 属性，触发 Header 毛玻璃过渡。
 */
export function HomeHeaderGlass() {
  useEffect(() => {
    const section2 = document.getElementById("snap-section-2");
    if (!section2) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          document.documentElement.setAttribute("data-header-glass", "true");
        } else {
          document.documentElement.removeAttribute("data-header-glass");
        }
      },
      {
        // 当 section 2 顶部进入视口时触发
        threshold: 0,
        rootMargin: "-74px 0px 0px 0px", // 减去 header 高度，header 下方开始算
      },
    );

    observer.observe(section2);

    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      html[data-header-glass] header[class*="sticky"] {
        background: transparent !important;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom-color: transparent !important;
        transition: background 0.35s ease, border-bottom-color 0.35s ease, backdrop-filter 0.35s ease;
      }
    `}</style>
  );
}
