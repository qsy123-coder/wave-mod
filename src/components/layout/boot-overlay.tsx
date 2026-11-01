"use client";

import { useEffect } from "react";

import CubeLoader from "@/components/ui/cube-loader";
import {
  BOOT_OVERLAY_ATTR,
  BOOT_OVERLAY_MAX_MS,
  BOOT_OVERLAY_STARTED_AT_ATTR,
  buildBootOverlayScript,
} from "@/lib/boot/boot-overlay";

/**
 * 动画至少完整露一次面。
 *
 * 冷启动时 HTML 与 JS 可能只差 200ms 到齐，水合完成就立刻撤掉会出现「闪一下」，
 * 比不显示更难受；这里让它至少播满这么久。
 */
const MIN_VISIBLE_MS = 700;

/**
 * 首页的冷启动加载动画（首次进入 / 首页缓存被清后的长时间回源）。
 *
 * 结构上是「内联脚本 + 一块默认隐藏的遮罩」：
 *   - 脚本在**首屏绘制前**决定 `html[data-boot-overlay]` 是 on 还是 off（判定见
 *     `lib/boot/boot-overlay.ts`），所以快的时候连一帧都不会闪；
 *   - 遮罩本身的立方体动画是纯 CSS，不依赖 JS —— 它要覆盖的正是「JS 还没到」的窗口；
 *   - 水合完成后由本组件的 effect 收掉，另有内联脚本里的 12s 硬上限兜底，
 *     避免 JS 或水合挂掉时把整站锁在遮罩后面。
 *
 * 只挂在首页（`(home)/layout.tsx`）：其它页面首屏是骨架屏，不需要整页动画。
 */
export function BootOverlay() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute(BOOT_OVERLAY_ATTR) !== "on") return;

    const hide = () => root.setAttribute(BOOT_OVERLAY_ATTR, "off");
    const shownAt = Number(root.getAttribute(BOOT_OVERLAY_STARTED_AT_ATTR) ?? "");
    const elapsed = Number.isFinite(shownAt) && shownAt > 0 ? performance.now() - shownAt : MIN_VISIBLE_MS;

    const timer = window.setTimeout(hide, Math.max(0, MIN_VISIBLE_MS - elapsed));
    const watchdog = window.setTimeout(hide, BOOT_OVERLAY_MAX_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(watchdog);
    };
  }, []);

  return (
    <>
      {/* 必须在首屏绘制前同步执行：决定遮罩是否可见 */}
      <script dangerouslySetInnerHTML={{ __html: buildBootOverlayScript() }} />
      {/* 关闭 JS 时不显示遮罩（否则会永久挡着页面） */}
      <noscript>
        <style>{`.boot-overlay{display:none!important}`}</style>
      </noscript>
      <div
        aria-hidden="true"
        className="boot-overlay fixed inset-0 z-[70] flex-col items-center justify-center bg-[var(--neo-panel)]"
      >
        {/* 与跨分站切换同一套 neo 网格底纹 */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #000 1.5px, transparent 1.6px), linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)",
            backgroundSize: "24px 24px, 44px 44px, 44px 44px",
          }}
        />
        <div className="relative">
          <CubeLoader variant="boot" />
        </div>
      </div>
    </>
  );
}
