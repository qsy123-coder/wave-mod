"use client";

import { useCallback, useEffect, useState } from "react";

export type LayoutMode = "grid" | "masonry";

const STORAGE_KEY = "mod-layout-preference";

function readPreference(): LayoutMode {
  if (typeof window === "undefined") return "grid";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "grid" || stored === "masonry") return stored;
  return "grid";
}

function writePreference(mode: LayoutMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}

/** 布局偏好 Hook：localStorage 持久化 + 状态管理 */
export function useLayoutPreference(): [LayoutMode, (mode: LayoutMode) => void] {
  // 初始固定为 "grid" 匹配 SSR，避免 hydration mismatch
  const [mode, setMode] = useState<LayoutMode>("grid");

  // hydration 后从 localStorage 读取用户偏好（SSR hydration 标准模式，需 suppress setState-in-effect 规则）
  useEffect(() => {
    // eslint-disable-next-line
    setMode(readPreference());
  }, []);

  const setAndPersist = useCallback((next: LayoutMode) => {
    setMode(next);
    writePreference(next);
  }, []);

  return [mode, setAndPersist];
}
