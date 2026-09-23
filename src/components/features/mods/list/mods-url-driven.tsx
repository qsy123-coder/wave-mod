"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { ModsListingView } from "@/components/features/mods/list/mods-listing-view";
import { isDefaultModsFilters, parseModsFilters } from "@/lib/mods-domain/filter-params";

type ModsUrlDrivenProps = {
  /**
   * 服务端渲染好的「默认筛选」视图（也就是 Suspense 的 fallback）。
   *
   * URL 上没有筛选时直接把它渲染出去，而不是重新拼一份等价的 JSX：两份写法早晚会
   * 漂移，而这里的漂移表现是「预渲染的 HTML 与 hydration 之后的内容不一致」——
   * 那种不一致会以 hydration mismatch 的形式炸在控制台里，很难追。
   */
  defaultView: ReactNode;
  availableCharacters: string[];
  counts: Record<string, number>;
  openModId?: string;
};

/**
 * 唯一调用 `useSearchParams()` 的地方，所以它必须是个**薄壳**。
 *
 * Next 的规则：路由被预渲染时，调用 `useSearchParams` 会让组件树一直到最近的 Suspense
 * 边界为止都变成客户端渲染，预渲染 HTML 里留下的是那个边界的 fallback（见
 * mods-listing.tsx）。把这次调用圈在这个不产出任何 DOM 结构的组件里，
 * 逃逸的范围就只有它自己。
 *
 * 这个组件里不要加任何 DOM 或状态：它渲染出来的东西就是 fallback 的等价物。
 */
export function ModsUrlDriven({
  defaultView,
  availableCharacters,
  counts,
  openModId,
}: ModsUrlDrivenProps) {
  const filters = parseModsFilters(useSearchParams() ?? new URLSearchParams());

  if (isDefaultModsFilters(filters)) {
    return <>{defaultView}</>;
  }

  return (
    <ModsListingView
      filters={filters}
      availableCharacters={availableCharacters}
      counts={counts}
      // 非默认筛选下种子一定不能用，这里直接不给 —— 闸门在 ModsListingView 里还有一道。
      staticSeed={null}
      openModId={openModId}
    />
  );
}
