import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteHeaderSkeleton } from "@/components/layout/site-header-skeleton";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#8B7355] bg-[radial-gradient(circle,rgba(255,255,255,0.18)_1.2px,transparent_1.3px),radial-gradient(circle,rgba(255,255,255,0.10)_0.8px,transparent_0.9px)] bg-[size:20px_20px,32px_32px] bg-[position:0_0,10px_10px]">
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
