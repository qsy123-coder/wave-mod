import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen" style={{ background: "var(--neo-dark)" }}>
      <Suspense fallback={null}>
        <SiteHeader />
      </Suspense>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
