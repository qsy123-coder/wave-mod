"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Wraps SiteFooter with pathname-based visibility.
 * Hidden on /guide page（满屏教程布局）; shown everywhere else.
 */
export function ConditionalFooter() {
  const pathname = usePathname();

  if (pathname === "/guide") return null;

  // /mods 是固定视口高度的应用壳（(site)/mods/layout.tsx 的 h-[calc(100dvh-var(--site-header-h))]
  // + overflow-hidden，外加 BodyScrollLock 锁住 body 滚动），页脚会被它撑出视口：
  // 正常情况下根本滚不到，刷新时浏览器还原滚动位置就把它顶出来。
  // /mods/<id> 是同一个壳的详情抽屉路由，一并排除。
  if (pathname === "/mods" || pathname.startsWith("/mods/")) return null;

  return <SiteFooter />;
}
