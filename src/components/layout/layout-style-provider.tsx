"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_LAYOUT_STYLE,
  LAYOUT_STYLE_COOKIE,
  LAYOUT_STYLE_COOKIE_MAX_AGE,
  LAYOUT_STYLE_STORAGE_KEY,
  type LayoutStyle,
} from "@/lib/layout-style/constants";
import {
  getRemoteLayoutStyleAction,
  syncLayoutStyleAction,
} from "@/actions/user/profile-actions";

type LayoutStyleContextValue = {
  layoutStyle: LayoutStyle;
  setLayoutStyle: (style: LayoutStyle) => void;
  isPending: boolean;
};

const LayoutStyleContext = createContext<LayoutStyleContextValue | null>(null);

function readLayoutStyleFromCookie(): LayoutStyle {
  if (typeof document === "undefined") return DEFAULT_LAYOUT_STYLE;
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${LAYOUT_STYLE_COOKIE}=([^;]+)`),
    );
    const value = match?.[1];
    return value === "zzz-immersive" || value === "neo-brutalism"
      ? value
      : DEFAULT_LAYOUT_STYLE;
  } catch {
    return DEFAULT_LAYOUT_STYLE;
  }
}

function writeLayoutStyleCookie(value: LayoutStyle): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LAYOUT_STYLE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${LAYOUT_STYLE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function LayoutStyleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [layoutStyle, setLayoutStyleState] = useState<LayoutStyle>(
    readLayoutStyleFromCookie,
  );

  useEffect(() => {
    let cancelled = false;
    async function syncFromRemote() {
      try {
        const remote = await getRemoteLayoutStyleAction();
        if (cancelled || !remote) return;
        setLayoutStyleState((prev) => {
          if (prev === remote) return prev;
          writeLayoutStyleCookie(remote);
          try { localStorage.setItem(LAYOUT_STYLE_STORAGE_KEY, remote); } catch { /* ignore */ }
          startTransition(() => { router.refresh(); });
          return remote;
        });
      } catch { /* Supabase 不可用时静默降级 */ }
    }
    syncFromRemote();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLayoutStyle = useCallback(
    (value: LayoutStyle) => {
      setLayoutStyleState(value);
      writeLayoutStyleCookie(value);
      try { localStorage.setItem(LAYOUT_STYLE_STORAGE_KEY, value); } catch { /* ignore */ }
      startTransition(() => { router.refresh(); });
      syncLayoutStyleAction(value).catch(() => { /* 静默降级 */ });
    },
    [router],
  );

  const contextValue = useMemo<LayoutStyleContextValue>(
    () => ({ layoutStyle, setLayoutStyle, isPending }),
    [layoutStyle, setLayoutStyle, isPending],
  );

  return (
    <LayoutStyleContext.Provider value={contextValue}>
      {children}
    </LayoutStyleContext.Provider>
  );
}

export function useLayoutStyle(): LayoutStyleContextValue {
  const context = useContext(LayoutStyleContext);
  if (!context) throw new Error("useLayoutStyle must be used within a <LayoutStyleProvider>");
  return context;
}
