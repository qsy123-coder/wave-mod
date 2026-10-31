"use client";

import { useEffect, useState } from "react";

/** 与 Tailwind 的 lg 断点同口径 */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * 当前是否桌面宽度（≥ 1024px）。
 *
 * SSR 与客户端首帧一律返回 `false`：服务端量不到视口，先按「非桌面」渲染，
 * 与静态 HTML 一致；挂载后立刻按真实宽度纠正。所有依赖它的效果（沉浸布局）
 * 本来就要等客户端状态就绪，所以这一次纠正不会造成可见的错位。
 *
 * 用 `matchMedia` 而不是监听 resize + 读 `innerWidth`：断点变化只在跨越 1024px
 * 时触发，窗口连续拖动不会反复 setState。
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
