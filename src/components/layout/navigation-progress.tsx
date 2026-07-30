"use client";

import { useEffect, useRef } from "react";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";

/**
 * 页面顶部导航进度条
 *
 * 与 NavigationLoadingContext 同步：loading 开始时动画启动，loading 结束时完成并淡出。
 * 不再依赖固定定时器。
 */
export function NavigationProgress() {
  const { isLoading } = useNavigationLoading();
  const barRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (isLoading) {
      // 启动动画
      bar.style.width = "0%";
      bar.style.opacity = "1";
      timers.current.push(
        setTimeout(() => { bar.style.width = "25%"; }, 60),
        setTimeout(() => { bar.style.width = "60%"; }, 400),
        setTimeout(() => { bar.style.width = "85%"; }, 1200),
      );
    } else {
      // 完成动画
      bar.style.width = "100%";
      timers.current.push(
        setTimeout(() => { bar.style.opacity = "0"; }, 300),
      );
    }

    return () => timers.current.forEach(clearTimeout);
  }, [isLoading]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999]" role="progressbar">
      <div
        ref={barRef}
        className="h-[3px] bg-gradient-to-r from-primary via-primary/80 to-primary/60"
        style={{
          width: "0%",
          opacity: 0,
          transition: "width 0.5s ease-out, opacity 0.3s ease-out",
        }}
      />
    </div>
  );
}
