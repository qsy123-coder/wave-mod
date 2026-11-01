"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_LAYOUT_STYLE,
  LAYOUT_STYLE_COOKIE,
  LAYOUT_STYLE_COOKIE_MAX_AGE,
  LAYOUT_STYLE_STORAGE_KEY,
  type LayoutStyle,
} from "@/lib/layout-style/constants";

type LayoutStyleContextValue = {
  layoutStyle: LayoutStyle;
  setLayoutStyle: (style: LayoutStyle) => void;
  isDark: boolean;
};

const LayoutStyleContext = createContext<LayoutStyleContextValue | null>(null);

function readLayoutStyleFromCookie(): LayoutStyle {
  if (typeof document === "undefined") return DEFAULT_LAYOUT_STYLE;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LAYOUT_STYLE_COOKIE}=([^;]+)`));
    const value = match?.[1];
    return value === "zzz-immersive" || value === "zzz-dark" ? value : DEFAULT_LAYOUT_STYLE;
  } catch {
    return DEFAULT_LAYOUT_STYLE;
  }
}

function writeLayoutStyleCookie(value: LayoutStyle): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LAYOUT_STYLE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${LAYOUT_STYLE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function applySkinClass(style: LayoutStyle): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.remove("theme-zzz-dark");
  if (style === "zzz-dark") html.classList.add("theme-zzz-dark");
}

export function LayoutStyleProvider({ children }: { children: ReactNode }) {
  const [layoutStyle, setLayoutStyleState] = useState<LayoutStyle>(readLayoutStyleFromCookie);

  useEffect(() => {
    // 登录已下线：皮肤只存 cookie + localStorage，不再跨设备同步。
    applySkinClass(layoutStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLayoutStyle = useCallback((value: LayoutStyle) => {
    setLayoutStyleState(value);
    applySkinClass(value);
    writeLayoutStyleCookie(value);
    try { localStorage.setItem(LAYOUT_STYLE_STORAGE_KEY, value); } catch { /* ignore */ }
  }, []);

  const contextValue = useMemo<LayoutStyleContextValue>(
    () => ({ layoutStyle, setLayoutStyle, isDark: layoutStyle === "zzz-dark" }),
    [layoutStyle, setLayoutStyle],
  );

  return (
    <LayoutStyleContext.Provider value={contextValue}>
      {children}
    </LayoutStyleContext.Provider>
  );
}

export function useLayoutStyle(): LayoutStyleContextValue {
  const context = useContext(LayoutStyleContext);
  if (!context) throw new Error("useLayoutStyle must be used within <LayoutStyleProvider>");
  return context;
}
