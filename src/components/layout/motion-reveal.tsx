import type { ComponentProps, CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * 入场动画：淡入 + 上移 + 微旋转，挂载即播。
 *
 * **用纯 CSS 而不是 framer-motion**：本组件在 40 个文件里用到，而它做的只是
 * 一个 0.45 秒的淡入 —— 为此把整个动画库（压缩后约 48KB）打进每个页面的客户端包
 * 不值得（2026-10-16 实测首页的 framer-motion chunk 就是这么来的）。
 * 关键帧见 `globals.css` 的 `motionRevealIn` / `.motion-reveal`。
 *
 * 与 framer-motion 版的语义逐条对齐：
 * - `initial` / `animate` → keyframes 的 from / to；
 * - `transition={{duration:0.45, delay, ease:"easeOut"}}` → `animation` + 内联 delay；
 * - `fill-mode: both` 保证 delay 期间也停在起始态（否则会先闪一下再动）。
 *
 * 不需要 "use client"：这里没有 hook、没有事件，就是个 div。
 * （它是被客户端组件 import 的，跟着那些组件的边界走。）
 */
type MotionRevealProps = ComponentProps<"div"> & {
  delay?: number;
  y?: number;
  rotate?: number;
};

export function MotionReveal({
  children,
  className,
  delay = 0,
  y = 24,
  rotate = 0,
  style,
  ...props
}: MotionRevealProps) {
  return (
    <div
      className={cn("motion-reveal", className)}
      style={
        {
          "--reveal-y": `${y}px`,
          "--reveal-r": `${rotate}deg`,
          animationDelay: `${delay}s`,
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      {children}
    </div>
  );
}
