"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 页面顶部导航进度条
 *
 * 监听 URL 变化，每次变化时挂载新的动画实例。分阶段动画后自动淡出。
 * 骨架屏由 ModsPageClient 内层 Suspense key 机制独立处理。
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams}`;

  return <ProgressBar key={routeKey} />;
}

function ProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    // 分阶段动画
    const animate = (width: string, delay: number) =>
      setTimeout(() => { if (bar) bar.style.width = width; }, delay);

    timers.current = [
      animate("25%", 60),
      animate("60%", 400),
      animate("85%", 1200),
      // 完成并淡出
      setTimeout(() => {
        if (bar) {
          bar.style.width = "100%";
          bar.style.opacity = "0";
        }
      }, 2500),
    ];

    return () => timers.current.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999]"
      role="progressbar"
    >
      <div
        ref={barRef}
        className="h-[3px] bg-gradient-to-r from-primary via-primary/80 to-primary/60"
        style={{
          width: "0%",
          opacity: 1,
          transition: "width 0.5s ease-out, opacity 0.3s ease-out",
        }}
      />
    </div>
  );
}
