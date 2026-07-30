"use client";

import { useCallback, useEffect, useState } from "react";

export type LayoutMode = "grid" | "masonry";
export type MasonryColumns = 3 | 4 | 5 | 6;

const STORAGE_KEY = "mod-layout-preference";
const COLUMNS_KEY = "mod-masonry-columns";

function readPreference(): LayoutMode {
  if (typeof window === "undefined") return "masonry";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "grid" || stored === "masonry") return stored;
  return "masonry";
}

function writePreference(mode: LayoutMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}

function readColumns(): MasonryColumns {
  if (typeof window === "undefined") return 3;
  const stored = window.localStorage.getItem(COLUMNS_KEY);
  const n = Number(stored);
  if (n === 3 || n === 4 || n === 5 || n === 6) return n;
  return 3;
}

function writeColumns(cols: MasonryColumns) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLUMNS_KEY, String(cols));
}

/** 布局偏好 Hook：localStorage 持久化 + 状态管理 */
export function useLayoutPreference() {
  // 初始固定为 "masonry" 匹配 SSR，避免 hydration mismatch
  const [mode, setMode] = useState<LayoutMode>("masonry");
  const [masonryColumns, setMasonryColumns] = useState<MasonryColumns>(3);

  // hydration 后从 localStorage 读取用户偏好（SSR hydration 标准模式，需 suppress setState-in-effect 规则）
  useEffect(() => {
    // eslint-disable-next-line
    setMode(readPreference());
    // eslint-disable-next-line
    setMasonryColumns(readColumns());
  }, []);

  const setAndPersist = useCallback((next: LayoutMode) => {
    setMode(next);
    writePreference(next);
  }, []);

  const setColumnsAndPersist = useCallback((next: MasonryColumns) => {
    setMasonryColumns(next);
    writeColumns(next);
  }, []);

  return {
    mode,
    setMode: setAndPersist,
    masonryColumns,
    setMasonryColumns: setColumnsAndPersist,
  } as const;
}
