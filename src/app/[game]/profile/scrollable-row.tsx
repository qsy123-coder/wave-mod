"use client";

import { useRef, type ReactNode } from "react";

/**
 * 横向滚动容器 — 滚轮直接横向滚动（无需 Shift）
 * 滚动条已隐藏
 */
export function ScrollableRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (!ref.current) return;
    // 将垂直滚轮增量转为横向滚动
    ref.current.scrollLeft += e.deltaY;
  };

  return (
    <div
      ref={ref}
      onWheel={handleWheel}
      className={`flex gap-2.5 overflow-x-auto pb-1 items-stretch
        [&::-webkit-scrollbar]:hidden
        [-ms-overflow-style:none]
        [scrollbar-width:none]
        ${className}`}
    >
      {children}
    </div>
  );
}
