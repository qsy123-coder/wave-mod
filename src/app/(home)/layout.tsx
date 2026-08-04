import { Suspense } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteHeaderSkeleton } from "@/components/layout/site-header-skeleton";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px]">
      <style>{`
        html[data-header-glass] .site-header-glass-target {
          background: rgba(255, 253, 245, 0.01) !important;
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          border-bottom-color: rgba(0, 0, 0, 0.5) !important;
          box-shadow: 0 4px 0 rgba(0, 0, 0, 0.5) !important;
        }
      `}</style>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      <main className="w-full -mt-[74px]">{children}</main>
    </div>
  );
}
