import { requireAdminUser } from "@/actions/auth/auth-actions";
import { SiteHeader } from "@/components/layout/site-header";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminUser("/admin/upload");

  return (
    <div className="min-h-screen" style={{ background: "var(--neo-dark)" }}>
      {/* 与 (site)/(home) 同一处改动：登录态搬到客户端后 header 不再挂起，
          这层 Suspense 已无内容可接，留着只会让人误以为它还会 suspend。 */}
      <SiteHeader />
      <main>{children}</main>
    </div>
  );
}
