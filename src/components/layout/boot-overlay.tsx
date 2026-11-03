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
 * 首页的冷启动加载动画（页面确实慢：Vercel 冷启动 / 首页缓存回源）。
 * 快的时候一帧都不闪 —— 不再有「本次会话第一次就无条件播」的分支。
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

    // 幂等：遮罩收起后 12s 兜底定时器还会再跑一次，别让属性反复抖动
    const hide = () => {
      if (root.getAttribute(BOOT_OVERLAY_ATTR) === "on") root.setAttribute(BOOT_OVERLAY_ATTR, "off");
    };
    const shownAt = Number(root.getAttribute(BOOT_OVERLAY_STARTED_AT_ATTR) ?? "");
    const elapsed = Number.isFinite(shownAt) && shownAt > 0 ? performance.now() - shownAt : MIN_VISIBLE_MS;
    const minWait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    /**
     * 等**整页**加载完再撤，而不是等 React 水合。
     *
     * 水合完成 ≠ 加载完成：首页还有几十张预览图，浏览器标签页一直在转圈。遮罩提前
     * 撤掉会出现「动画没了、页面还在慢慢长图」的断层，用户体感更差。
     * `window.load` 就是子资源（图片等）全部落地的时刻，也就是标签页停止转圈的时刻。
     */
    let timer: number | undefined;
    const scheduleHide = () => {
      timer = window.setTimeout(hide, minWait);
    };

    if (document.readyState === "complete") {
      scheduleHide();
    } else {
      window.addEventListener("load", scheduleHide, { once: true });
    }

    // 兜底：某个资源一直挂着时，不能让遮罩把页面锁死
    const watchdog = window.setTimeout(hide, BOOT_OVERLAY_MAX_MS);
    return () => {
      window.removeEventListener("load", scheduleHide);
      if (timer !== undefined) window.clearTimeout(timer);
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
