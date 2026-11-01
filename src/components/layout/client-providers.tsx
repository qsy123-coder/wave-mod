"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, Suspense } from "react";

import { AutoOpenModsPrompt } from "@/components/features/home/auto-open-mods-prompt";
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
      <Suspense fallback={null}>
        <LastGameVisitBridge />
      </Suspense>
      {/* 顶栏、/mods 外壳与侧栏共用这一份偏好状态（直达分类 / 沉浸布局） */}
      <SitePreferencesProvider>
        {children}
        {/* 直达分类的拦截弹窗要挂在全局：任何页面点「首页」都要能拦住 */}
        <AutoOpenModsPrompt />
      </SitePreferencesProvider>
    </QueryClientProvider>
  );
}
