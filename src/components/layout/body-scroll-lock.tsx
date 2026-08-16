"use client";

import { useEffect } from "react";

/**
 * 锁定 body 滚动（用于固定视口高度的全屏页面布局，如角色分类页）。
 * 挂载即锁、卸载即恢复，覆盖骨架屏与内容加载两个阶段。
 */
export function BodyScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return null;
}
