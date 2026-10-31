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
 *   - 高度与 margin 都是可插值的长度（`calc(...)` / `100dvh`），两者同向变化，
 *     过渡期间外层总高度恒定 `100dvh`，不会出现中间态把页面撑出滚动条；
 *   - `--site-header-h` 是 header 用 ResizeObserver 实测写入的，位移不改它。
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
          : "h-[calc(100dvh-var(--site-header-h))]",
      )}
    >
      {children}
    </div>
  );
}
