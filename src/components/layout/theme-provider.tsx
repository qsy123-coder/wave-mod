"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_THEME,
  isThemeName,
  parseThemeCookie,
  THEMES,
  THEME_CHANGE_EVENT,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_STORAGE_KEY,
  type ThemeName,
} from "@/lib/theme/constants";

type ThemeContextValue = {
  setTheme: (theme: string) => void;
  theme: ThemeName;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** 所有皮肤类名，切换时先整体摘掉再加新的（避免多个 theme-* 同时挂在 <html> 上）。 */
const THEME_CLASSES = THEMES as readonly string[];

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  root.classList.add(theme);
  // 通知 LayoutStyleProvider 重新裁决 zzz-dark 的去留（新拟物优先）。
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
}

/**
 * 从 cookie 读当前皮肤。
 *
 * 之所以是 cookie 而不是 localStorage：cookie 能在**首屏绘制前**被
 * `src/app/layout.tsx` 的内联脚本读到，从而消除「先渲染默认皮肤再闪成所选皮肤」。
 * localStorage 只能在 JS 与 React 都就绪之后读，闪是必然的。
 */
function readThemeFromCookie(): ThemeName {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const fromCookie = parseThemeCookie(document.cookie);
  if (fromCookie) return fromCookie;
  try {
    // cookie 还没写过（老用户首次访问新版本）：回退到历史上的 localStorage 值，
    // 由下面的 useEffect 把它迁移进 cookie。
    const legacy = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(legacy) ? legacy : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeThemeCookie(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 初始值在渲染期同步从 cookie 读：服务端渲染时拿到默认值，客户端水合时拿到真实值。
  // 本组件只渲染 context provider（不产出 DOM），两端差异不会造成水合不匹配。
  const [theme, setThemeState] = useState<ThemeName>(readThemeFromCookie);

  useEffect(() => {
    // 补齐两件事：① 新用户/老用户把 localStorage 值迁移进 cookie；
    // ② 万一内联脚本因 CSP 被拦，这里兜底把类名挂上（幂等）。
    applyTheme(theme);
    writeThemeCookie(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* localStorage 不可用时忽略 */
    }
    // 只在挂载时跑一次，迁移完就交给 setTheme 维护
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((value: string) => {
    const nextTheme = isThemeName(value) ? value : DEFAULT_THEME;
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    writeThemeCookie(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      setTheme,
      theme,
    }),
    [setTheme, theme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
