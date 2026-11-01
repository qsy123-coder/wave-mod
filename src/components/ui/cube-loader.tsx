"use client";

import { useEffect, useState } from "react";

/**
 * - `switch`：跨分站切换用，挂载后 80ms 淡入；
 * - `boot`：首页冷启动遮罩用。遮罩出现在**React 水合之前**，那时 setTimeout /
 *   setInterval 根本还没跑起来，所以它必须首帧就可见、文案也不依赖 JS 计时器。
 */
export type CubeLoaderVariant = "switch" | "boot";

export default function CubeLoader({
  targetName = "",
  variant = "switch",
}: {
  targetName?: string;
  variant?: CubeLoaderVariant;
}) {
  const isBoot = variant === "boot";
  const [show, setShow] = useState(isBoot);
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (isBoot) return;
    const t = setTimeout(() => setShow(true), 80);
    return () => clearTimeout(t);
  }, [isBoot]);

  // 动态省略号动画（boot 变体不跑：水合前没有计时器可用）
  useEffect(() => {
    if (isBoot) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [isBoot]);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-16 p-12 min-h-[400px] perspective-container transition-opacity duration-500 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 3D 场景外层容器 */}
      <div className="relative w-36 h-36 flex items-center justify-center preserve-3d">
        {/* 旋转立方体总容器 */}
        <div className="relative w-full h-full preserve-3d animate-cube-spin">
          {/* 内部发光核心 — neo accent */}
          <div className="absolute inset-0 m-auto w-12 h-12 rounded-full blur-md shadow-[0_0_60px_rgba(255,122,122,0.8)] animate-cube-pulse" style={{ backgroundColor: "#ff7a7a" }} />

          {/* neo-accent: #ff7a7a 粉红 */}
          <div className="cube-side-wrapper cube-front">
            <div className="cube-face border-2 shadow-[0_0_25px_rgba(255,122,122,0.5)]" style={{ backgroundColor: "rgba(255,122,122,0.12)", borderColor: "#ff7a7a" }} />
          </div>
          <div className="cube-side-wrapper cube-back">
            <div className="cube-face border-2 shadow-[0_0_25px_rgba(255,122,122,0.5)]" style={{ backgroundColor: "rgba(255,122,122,0.12)", borderColor: "#ff7a7a" }} />
          </div>
          {/* neo-secondary: #ffd84f 明黄 */}
          <div className="cube-side-wrapper cube-right">
            <div className="cube-face border-2 shadow-[0_0_25px_rgba(255,216,79,0.5)]" style={{ backgroundColor: "rgba(255,216,79,0.12)", borderColor: "#ffd84f" }} />
          </div>
          <div className="cube-side-wrapper cube-left">
            <div className="cube-face border-2 shadow-[0_0_25px_rgba(255,216,79,0.5)]" style={{ backgroundColor: "rgba(255,216,79,0.12)", borderColor: "#ffd84f" }} />
          </div>
          {/* neo-muted: #bcaeff 淡紫 */}
          <div className="cube-side-wrapper cube-top">
            <div className="cube-face border-2 shadow-[0_0_25px_rgba(188,174,255,0.5)]" style={{ backgroundColor: "rgba(188,174,255,0.12)", borderColor: "#bcaeff" }} />
          </div>
          <div className="cube-side-wrapper cube-bottom">
            <div className="cube-face border-2 shadow-[0_0_25px_rgba(188,174,255,0.5)]" style={{ backgroundColor: "rgba(188,174,255,0.12)", borderColor: "#bcaeff" }} />
          </div>
        </div>

        {/* 底部投影阴影 */}
        <div className="absolute -bottom-28 w-36 h-10 blur-2xl rounded-[100%] animate-cube-shadow" style={{ backgroundColor: "rgba(255,122,122,0.15)" }} />
      </div>

      {/* 加载提示文字 */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h3 className="text-base font-bold tracking-[0.3em] uppercase flex items-center gap-1" style={{ color: "#ffd84f" }}>
          {isBoot ? "正在加载站点" : `正在切换到 ${targetName}`}
          {isBoot ? null : <span className="inline-block w-5 text-left">{dots}</span>}
        </h3>
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#bcaeff" }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-cube-pulse" style={{ backgroundColor: "#ff7a7a" }} />
          <span>{isBoot ? "首次进入会慢一点，马上就好…" : "模块加载中，马上就好…"}</span>
        </div>
      </div>
    </div>
  );
}
