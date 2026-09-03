"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useNavigationLoading } from "@/components/layout/navigation-loading-context";

/**
 * 监听路由变化，跨页导航（isPageLoading）在目标 URL 确认后自动结束。
 *
 * 同时监听 pathname + search，保证 query-only 导航（如角色筛选、排序）也能结束加载态。
 */
export function RouteChangeListener() {
  const { stopPageLoading } = useNavigationLoading();
  const pathname = usePathname();
  const search = useSearchParams();

  const current = `${pathname}${search && search.toString() ? `?${search.toString()}` : ""}`;
  const prevRef = useRef(current);

  useEffect(() => {
    if (prevRef.current !== current) {
      prevRef.current = current;
      stopPageLoading();
    }
  }, [current, stopPageLoading]);

  return null;
}
