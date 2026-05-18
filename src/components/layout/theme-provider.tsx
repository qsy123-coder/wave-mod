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

const themes = ["theme-arcade", "theme-neon-night", "theme-sunset-flyer"] as const;

type ThemeName = (typeof themes)[number];

type ThemeContextValue = {
  setTheme: (theme: string) => void;
  theme: ThemeName;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const storageKey = "wavemod-theme";
const defaultTheme: ThemeName = "theme-arcade";

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  root.classList.remove(...themes);
  root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(storageKey);
    const nextTheme = themes.includes(storedTheme as ThemeName)
      ? (storedTheme as ThemeName)
      : defaultTheme;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const setTheme = useCallback((value: string) => {
    const nextTheme = themes.includes(value as ThemeName)
      ? (value as ThemeName)
      : defaultTheme;

    setThemeState(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
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
