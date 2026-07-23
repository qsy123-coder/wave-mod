"use client";

import { useCallback, useState } from "react";

export type LayoutMode = "grid" | "masonry";

const STORAGE_KEY = "mod-layout-preference";

/** 从 localStorage 读取布局偏好（仅在客户端调用） */
function readPreference(): LayoutMode {
  if (typeof window === "undefined") return "grid";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "grid" || stored === "masonry") return stored;
  return "grid";
}

/** 写入 localStorage */
function writePreference(mode: LayoutMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}

/** 布局偏好 Hook：localStorage 持久化 + 状态管理 */
export function useLayoutPreference(): [LayoutMode, (mode: LayoutMode) => void] {
  // lazy initializer 在客户端首次渲染时同步读取 localStorage，避免 effect 中的 setState
  const [mode, setMode] = useState<LayoutMode>(() => readPreference());

  const setAndPersist = useCallback((next: LayoutMode) => {
    setMode(next);
    writePreference(next);
  }, []);

  return [mode, setAndPersist];
}
