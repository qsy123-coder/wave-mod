"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, Suspense } from "react";

import { AuthHashSessionBridge } from "@/components/features/auth/auth-hash-session-bridge";
import { SessionProvider } from "@/components/features/auth/session-provider";
import { LastGameVisitBridge } from "@/components/features/games/last-game-visit-bridge";
import { SitePreferencesProvider } from "@/components/layout/site-preferences-provider";

type ClientProvidersProps = {
  children: React.ReactNode;
};

export function ClientProviders({ children }: ClientProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* SessionProvider 必须包在 AuthHashSessionBridge **外面**：那个 bridge 会调
          setSession()，而会话态由 SessionProvider 通过 onAuthStateChange 观察。
          反过来的话，登录回调建好的会话不会反映到头部。 */}
      <SessionProvider>
        <Suspense fallback={null}>
          <AuthHashSessionBridge />
        </Suspense>
        <Suspense fallback={null}>
          <LastGameVisitBridge />
        </Suspense>
        {/* 顶栏、/mods 外壳与侧栏共用这一份偏好状态（直达分类 / 沉浸布局） */}
        <SitePreferencesProvider>{children}</SitePreferencesProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
