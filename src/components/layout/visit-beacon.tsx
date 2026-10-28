"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { getDeviceId } from "@/lib/engagement/device";
import { NOCOUNT_COOKIE, VISITS_SKIP_PREFIXES } from "@/lib/visits/constants";

/**
 * 站点访问打点：每发生一次页面浏览（含站内路由切换）报一次。
 *
 * 为什么放客户端：页面是静态渲染 + nginx 缓存的，服务端不会为每次访问执行渲染，
 * 只有浏览器发出来的请求才代表「真有人打开了这一页」。
 *
 * 三条硬规则：
 *   1. **失败静默** —— 打点挂了绝不能影响页面，连控制台都不该刷错误。
 *   2. **站长设备不计数** —— 打开过 `/visits` 的浏览器会被种上 nocount，直接跳过。
 *   3. **后台与统计页自身不计数** —— 否则调一次样式就把今日 UV 抬一次。
 */
export function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (VISITS_SKIP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;

    // 站长设备：cookie 是普通 cookie（非 httpOnly），这里读得到
    if (document.cookie.split(";").some((part) => part.trim() === `${NOCOUNT_COOKIE}=1`)) return;

    const deviceId = getDeviceId();
    // 设备号取不到（存储完全被禁用）就整体跳过：只计 PV 不计 UV 会让两个口径互相打架
    if (!deviceId) return;

    void fetch("/api/visits", {
      method: "POST",
      headers: { "x-device-id": deviceId },
      keepalive: true,
    }).catch(() => {
      // 断网、被拦截、页面正在卸载：都不重要，丢掉这次打点
    });
  }, [pathname]);

  return null;
}
