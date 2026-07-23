import { Suspense } from "react";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteHeaderSkeleton } from "@/components/layout/site-header-skeleton";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminUser("/admin/upload");

  return (
    <div className="min-h-screen" style={{ background: "var(--neo-dark)" }}>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      <main>{children}</main>
    </div>
  );
}
