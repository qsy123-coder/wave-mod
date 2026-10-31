"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useSitePreferences } from "@/components/layout/site-preferences-provider";
import { useIsDesktop } from "@/components/layout/use-is-desktop";
import { isImmersiveActive } from "@/lib/preferences/site-preferences";
import { cn } from "@/lib/utils";

/**
 * `/mods` 的满屏外壳（原 `(site)/mods/layout.tsx` 里那层固定高度 div）。
 *
 * 沉浸布局下要把导航栏让出来的那 76px 还给内容区：
 *   - 导航栏本身是 `sticky`，只做 `-translate-y-full` 不会释放它占的文档流高度，
 *     所以这里用「高度补满 100dvh + 负 margin-top 抵消 header 高度」；
 *   - `--site-header-h` 是 header 用 ResizeObserver 实测写入的，位移不改它。
 *
 * **不在这里做 height/margin-top 的插值动画。** 这两个属性逐帧变化会让整块应用壳（含
 * 网格与工具栏）每帧重新布局，实测和侧栏宽度过渡叠在一起掉到 ~45fps。这里用
 * `duration-0` + `transition-delay` 控制切换时机：
 *   - 收起（目标状态 `delay-0`）：外壳立刻补满视口，此刻导航栏还盖在顶部 76px 上；
 *     随后导航栏用 `translate` 滑走，把内容「揭」出来 —— 切换被导航栏遮住；
 *   - 展开（目标状态 `delay-300`）：外壳先保持满屏，等导航栏滑下来盖住顶部之后
 *     才缩回 `100dvh - header`。若立刻缩回，导航栏还在半空，顶部会露出一条空隙。
 * 全程每帧只有 header 的 transform/opacity 与侧栏面板的位移，走合成层。
 *
 * 之所以抽成客户端组件：沉浸状态来自 Context，而 layout 本身是服务端组件。
 * `(site)/mods/layout.tsx` 只把它当成一层外壳，内部结构原样保留。
 */
export function ModsShell({ children }: { children: ReactNode }) {
  const { immersive } = useSitePreferences();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const active = isImmersiveActive({ immersive, isDesktop, pathname });

  return (
    <div
      data-mods-shell
      className={cn(
        "flex flex-col overflow-hidden transition-[height,margin-top] duration-0",
        active
          ? "h-[100dvh] mt-[calc(var(--site-header-h)*-1)] delay-0"
          : "h-[calc(100dvh-var(--site-header-h))] mt-0 lg:delay-300 lg:motion-reduce:delay-0",
      )}
    >
      {children}
    </div>
  );
}
