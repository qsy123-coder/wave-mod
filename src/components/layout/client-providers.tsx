"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, Suspense } from "react";

import { AuthHashSessionBridge } from "@/components/features/auth/auth-hash-session-bridge";
import { LastGameVisitBridge } from "@/components/features/games/last-game-visit-bridge";

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
        <AuthHashSessionBridge />
      </Suspense>
      <Suspense fallback={null}>
        <LastGameVisitBridge />
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
