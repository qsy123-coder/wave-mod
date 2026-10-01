"use client";

import { useEffect } from "react";

import { reportView } from "@/lib/engagement/client";

/**
 * 详情页浏览上报。
 *
 * 去重分两层：
 *   - 客户端：store 里的 viewReported 保证同一会话同一个 mod 只报一次
 *     （原来那套 sessionStorage 键值由它接管，不再需要每个 mod 写一条记录）。
 *   - 服务端：按「设备号 + 上海日期」去重，刷新、第二天再来算新的一次。
 *
 * 上报失败一律静默 —— 浏览数不在关键路径上，绝不能因为它报错打断页面。
 */
export function ModViewTracker({ modId }: { modId: string }) {
  useEffect(() => {
    reportView(modId);
  }, [modId]);

  return null;
}
