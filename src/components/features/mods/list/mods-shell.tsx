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
 * **高度/负 margin 与导航栏同步做 300ms 过渡。** 两者使用同一 easing：
 *   - 导航栏 translateY 从 -100% → 0，底边从 0 → 76px；
 *   - 外壳 margin-top 从 -76px → 0，顶边 = 76px（文档流里的 header 占位）+ margin
 *     = 76 × progress，正好等于导航栏底边 —— 全程贴合，不会露缝；
 *   - 高度同步从 100dvh → 100dvh-76，底边始终停在视口底部。
 *
 * ⚠️ 以前这里用「delay 300ms 再跳」来避免露缝，结果是导航栏/侧栏动画都结束后
 * 网格区域才整体下跳 76px，用户明确反馈「左侧和上面先完成，网格被卡下来」。
 * 不要再改回延迟跳变。
 *
 * 水平方向的放大/缩小由网格自己的 FLIP transform 负责（见 mods-infinite-grid），
 * 外壳只处理这 76px 的垂直变化，不会重排卡片。
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
        "flex flex-col overflow-hidden transition-[height,margin-top] duration-300 ease-out motion-reduce:transition-none",
        active
          ? "h-[100dvh] mt-[calc(var(--site-header-h)*-1)]"
          : "h-[calc(100dvh-var(--site-header-h))] mt-0",
      )}
    >
      {children}
    </div>
  );
}
