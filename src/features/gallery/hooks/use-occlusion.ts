"use client";

import { useEffect, useRef, useState } from "react";

interface UseOcclusionOptions {
  /** 视口扩展边距，提前加载即将进入视口的图片。默认 300px */
  rootMargin?: string;
  /** 交叉阈值。默认 0（只要 1px 进入就触发） */
  threshold?: number;
  /** 是否在离开视口后卸载图片以节省内存。默认 false（保持已加载的图片） */
  unmountOnExit?: boolean;
}

/**
 * Intersection Observer 虚拟化 Hook。
 *
 * 每个图片占位元素使用一个 Observer 实例。
 * 进入视口时触发渲染真实图片组件，离开视口时可选卸载。
 *
 * 从参考项目 chenglou.me 的 occlusion culling 移植，
 * 用 Intersection Observer 替代手动 viewport 计算。
 */
export function useOcclusion(options?: UseOcclusionOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const { rootMargin = "300px", threshold = 0, unmountOnExit = false } = options ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting) {
          setInView(true);
        } else if (unmountOnExit) {
          setInView(false);
        }
        // 默认：一旦可见就保持可见（避免滚动时反复挂载/卸载）
      },
      { rootMargin, threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, unmountOnExit]);

  return { ref, inView };
}
