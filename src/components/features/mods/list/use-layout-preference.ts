"use client";

import { useCallback, useEffect, useState } from "react";

export type LayoutMode = "grid" | "masonry";
export type MasonryColumns = 2 | 3 | 4 | 5 | 6;

const STORAGE_KEY = "mod-layout-preference";
const COLUMNS_KEY = "mod-masonry-columns";

/**
 * 窄屏列数下限。640px 取 Tailwind 的 sm 断点，与工具栏、网格的其它断点同口径。
 *
 * 背景：列数默认值原来是写死的 5，于是 390px 视口下每一列只有约 70px、
 * 预览图实测仅 **23px** —— 人物完全看不清，而「一眼看清预览图」正是这个
 * 列表页存在的意义（2026-10-02 实测）。
 */
const MOBILE_BREAKPOINT = 640;
const MOBILE_DEFAULT_COLUMNS: MasonryColumns = 2;
/** 网格在 SSR / 首次渲染时的初值：服务端量不到视口，先按桌面口径渲染，客户端挂载后按窗口宽度纠正 */
export const DESKTOP_DEFAULT_COLUMNS: MasonryColumns = 5;

function isMasonryColumns(value: number): value is MasonryColumns {
  return value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

/**
 * 用户**没有显式选过**列数时，按宽度给的默认列数。
 *
 * 导出给 `mods-infinite-grid` 的自适应监听用，让「默认值」只有这一处定义 ——
 * 否则网格里再写一份，两边会漂移。
 */
export function defaultColumnsForWidth(width: number): MasonryColumns {
  return width < MOBILE_BREAKPOINT ? MOBILE_DEFAULT_COLUMNS : DESKTOP_DEFAULT_COLUMNS;
}

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

/**
 * 读用户**显式选过**的列数。没选过时返回 `null`，而不是兜一个具体数字。
 *
 * 这个 `null` 是本次修复的关键：只要这里返回数字，网格里
 * `masonryColumns ?? autoColCount` 的右边就永远取不到值，
 * 「按屏幕宽度自适应」那条分支事实上是**死代码** —— 默认列数就被钉死在 5。
 */
function readColumns(): MasonryColumns | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(COLUMNS_KEY);
  const n = Number(stored);
  return isMasonryColumns(n) ? n : null;
}

function writeColumns(cols: MasonryColumns) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLUMNS_KEY, String(cols));
}

/** 布局偏好 Hook：localStorage 持久化 + 状态管理 */
export function useLayoutPreference() {
  // 初始固定为 "masonry" 匹配 SSR，避免 hydration mismatch
  const [mode, setMode] = useState<LayoutMode>("masonry");
  // null = 用户没显式选过 ⇒ 交给网格按屏幕宽度自适应（手机上 2 列）。
  // 初值 null 与服务端渲染一致，不会产生 hydration mismatch。
  const [masonryColumns, setMasonryColumns] = useState<MasonryColumns | null>(null);

  // hydration 后从 localStorage 读取用户偏好（SSR hydration 标准模式，需 suppress setState-in-effect 规则）
  useEffect(() => {
    // eslint-disable-next-line
    setMode(readPreference());
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
