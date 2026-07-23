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
    <div className="min-h-screen bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px]">
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
