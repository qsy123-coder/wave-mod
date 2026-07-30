import { Suspense } from "react";

import { NavigationLoadingProvider } from "@/components/layout/navigation-loading-context";
import { NavigationProgress } from "@/components/layout/navigation-progress";

export default function ModsLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigationLoadingProvider>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="flex h-[calc(100vh-60px)] flex-col overflow-hidden">
        <div className="flex flex-1 gap-6 overflow-hidden py-3">
          {children}
        </div>
      </div>
    </NavigationLoadingProvider>
  );
}
