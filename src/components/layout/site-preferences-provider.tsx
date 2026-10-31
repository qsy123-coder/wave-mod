"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  readAutoOpenMods,
  readImmersiveMods,
  writeAutoOpenMods,
  writeImmersiveMods,
} from "@/lib/preferences/site-preferences";

type SitePreferencesContextValue = {
  /** 访问 `/` 时是否直接打开角色分类页 */
  autoOpenMods: boolean;
  setAutoOpenMods: (value: boolean) => void;
  /** `/mods` 是否隐藏左侧栏与顶部导航栏（仅桌面端真正生效） */
  immersive: boolean;
  setImmersive: (value: boolean) => void;
};

const SitePreferencesContext = createContext<SitePreferencesContextValue | null>(null);

/**
 * 站点级浏览偏好的**唯一**状态源。
 *
 * 为什么需要 Context 而不是每个组件各读一次 localStorage：
 *   - 顶栏（账户下拉）与 `/mods` 工具栏是两处入口，改一处另一处必须立刻跟着变；
 *   - 沉浸状态还要同时驱动三个布局层级：`(site)` 的 header、`(site)/mods` 的外壳、
 *     `mods-listing-view` 的侧栏。
 * 挂在根布局的 `ClientProviders` 后，这三处拿到的是同一个值。
 *
 * 初值必须是 `false`（与静态 HTML 一致），挂载后再从 localStorage 恢复 ——
 * 否则服务端渲染的开关状态会和客户端不一致（hydration mismatch）。
 * 代价只是硬加载时一次很短的「关 → 开」状态切换，沉浸布局因此播放入场动画。
 */
export function SitePreferencesProvider({ children }: { children: ReactNode }) {
  const [autoOpenMods, setAutoOpenModsState] = useState(false);
  const [immersive, setImmersiveState] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration 后读取本机偏好（与服务端标记一致）
    setAutoOpenModsState(readAutoOpenMods());
    setImmersiveState(readImmersiveMods());
  }, []);

  const setAutoOpenMods = useCallback((value: boolean) => {
    setAutoOpenModsState(value);
    writeAutoOpenMods(value);
  }, []);

  const setImmersive = useCallback((value: boolean) => {
    setImmersiveState(value);
    writeImmersiveMods(value);
  }, []);

  const contextValue = useMemo<SitePreferencesContextValue>(
    () => ({ autoOpenMods, setAutoOpenMods, immersive, setImmersive }),
    [autoOpenMods, setAutoOpenMods, immersive, setImmersive],
  );

  return (
    <SitePreferencesContext.Provider value={contextValue}>{children}</SitePreferencesContext.Provider>
  );
}

export function useSitePreferences(): SitePreferencesContextValue {
  const context = useContext(SitePreferencesContext);
  if (!context) throw new Error("useSitePreferences must be used within <SitePreferencesProvider>");
  return context;
}
