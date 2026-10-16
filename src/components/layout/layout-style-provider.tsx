"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  DEFAULT_LAYOUT_STYLE,
  LAYOUT_STYLE_COOKIE,
  LAYOUT_STYLE_COOKIE_MAX_AGE,
  LAYOUT_STYLE_STORAGE_KEY,
  type LayoutStyle,
} from "@/lib/layout-style/constants";
import { NEUMORPHISM_THEME, parseThemeCookie, THEME_CHANGE_EVENT } from "@/lib/theme/constants";
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

/** 皮肤切换器当前是否选了「新拟物」。 */
function isNeumorphismActive(): boolean {
  if (typeof document === "undefined") return false;
  return parseThemeCookie(document.cookie) === NEUMORPHISM_THEME;
}

function applySkinClass(style: LayoutStyle): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.remove("theme-zzz-dark");
  // 「新拟物优先」：皮肤切换器选了新拟物时，不再挂 ZZZ 深色类。
  // 两个类都挂在 <html> 上、选择器特异度都是 (0,1,0)，同时存在就只能靠 CSS
  // 源码顺序决胜负 —— 太脆。在源头判掉，页面上就只会有一套语言。
  if (style === "zzz-dark" && !isNeumorphismActive()) html.classList.add("theme-zzz-dark");
}

export function LayoutStyleProvider({ children }: { children: ReactNode }) {
  const [layoutStyle, setLayoutStyleState] = useState<LayoutStyle>(readLayoutStyleFromCookie);
  // 事件回调里要读到最新的 layoutStyle，但又不想因此重建监听器（会漏事件）
  const layoutStyleRef = useRef(layoutStyle);
  layoutStyleRef.current = layoutStyle;

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

  // 皮肤切换器换肤时重新裁决 zzz-dark 的去留。两个 provider 是并列的兄弟节点，
  // 没有父子关系可以传状态，靠 ThemeProvider 派发的事件通知（见 theme/constants.ts）。
  useEffect(() => {
    const handleThemeChange = () => applySkinClass(layoutStyleRef.current);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
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
