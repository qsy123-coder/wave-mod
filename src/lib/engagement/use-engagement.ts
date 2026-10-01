"use client";

import { useCallback, useEffect, useState } from "react";

import {
  EMPTY_MINE,
  getEntry,
  reportView,
  request,
  seed,
  subscribe,
  toggle,
  type EngagementEntry,
} from "./client";
import type { EngagementCounts } from "./types";

/**
 * 订阅某个 MOD 的互动状态。
 *
 * `initialCounts` 是服务端渲染时快照里的旧值：它保证**首屏/hydration 与 SSR 一致**，
 * 等客户端批量拉到新值后再无缝替换。拉不到就一直是它 —— 这就是「静默降级」。
 */
export function useEngagement(modId: string, initialCounts: EngagementCounts) {
  const [entry, setEntry] = useState<EngagementEntry>(() => ({
    counts: initialCounts,
    mine: EMPTY_MINE,
    hydrated: false,
  }));

  useEffect(() => {
    // 用快照值打底（已有更权威的值时 seed 是 no-op），再把 store 里的当前值同步进来
    seed(modId, initialCounts);
    const seeded = getEntry(modId);
    // hydration 后与模块级 store 对齐
    if (seeded) setEntry(seeded);

    const unsubscribe = subscribe(modId, setEntry);
    request(modId);

    return unsubscribe;
    // initialCounts 只在首次 seed 时用到，放进依赖会导致每次渲染都重订阅
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modId]);

  const like = useCallback(() => toggle(modId, "like"), [modId]);
  const favorite = useCallback(() => toggle(modId, "favorite"), [modId]);
  const view = useCallback(() => reportView(modId), [modId]);

  return {
    counts: entry.counts,
    mine: entry.mine,
    hydrated: entry.hydrated,
    like,
    favorite,
    view,
  } as const;
}
