"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSitePreferences } from "@/components/layout/site-preferences-provider";

/**
 * 首页直达的**客户端兜底**。
 *
 * `(home)/layout.tsx` 里的内联脚本只在**硬加载**（浏览器解析 HTML）时执行；
 * 站内客户端导航不会重新执行 `<script>` —— 比如从 `/mods` 点 logo 回 `/`，
 * 首页会照常渲染出来。这个组件在挂载后补一次 `router.replace`。
 *
 * 它读的是 Provider 的状态（挂载后从 localStorage 恢复），所以：
 *   - 硬加载：内联脚本通常已经先换页，这里多半根本不会挂载；
 *   - 站内导航：Provider 早在根布局就绪，effect 第一次运行就能拿到真值。
 */
export function HomeAutoRedirect() {
  const { autoOpenMods } = useSitePreferences();
  const router = useRouter();

  useEffect(() => {
    if (!autoOpenMods) return;
    router.replace("/mods");
  }, [autoOpenMods, router]);

  return null;
}
