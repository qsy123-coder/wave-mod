"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_LAYOUT_STYLE,
  LAYOUT_STYLE_COOKIE,
  LAYOUT_STYLE_COOKIE_MAX_AGE,
  LAYOUT_STYLE_STORAGE_KEY,
  type LayoutStyle,
} from "@/lib/layout-style/constants";
import { getRemoteLayoutStyleAction, syncLayoutStyleAction } from "@/actions/user/profile-actions";

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
    let cancelled = false;
    applySkinClass(layoutStyle);

    async function syncFromRemote() {
      try {
        const remote = await getRemoteLayoutStyleAction();
        if (cancelled || !remote) return;
        setLayoutStyleState((prev) => {
          if (prev === remote) return prev;
          applySkinClass(remote);
          writeLayoutStyleCookie(remote);
          try { localStorage.setItem(LAYOUT_STYLE_STORAGE_KEY, remote); } catch { /* ignore */ }
          return remote;
        });
      } catch { /* 静默降级 */ }
    }
    syncFromRemote();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLayoutStyle = useCallback((value: LayoutStyle) => {
    setLayoutStyleState(value);
    applySkinClass(value);
    writeLayoutStyleCookie(value);
    try { localStorage.setItem(LAYOUT_STYLE_STORAGE_KEY, value); } catch { /* ignore */ }
    syncLayoutStyleAction(value).catch(() => {});
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
