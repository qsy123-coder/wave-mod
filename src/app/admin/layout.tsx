import { SiteHeader } from "@/components/layout/site-header";

/**
 * 后台数据必须每次实时读库：去掉 Supabase 的 cookies 守卫后，这些页面不再自动
 * 被判为动态；不显式声明的话 Next 会在 build 时把它们预渲染成静态 HTML，
 * 表现为「后台列表永远停在构建那一刻」。
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 访问控制已上移到 proxy.ts（Basic Auth）：nginx 一层 + 应用层一层。
  return (
    <div className="min-h-screen" style={{ background: "var(--neo-dark)" }}>
      {/* 与 (site)/(home) 同一处改动：登录态搬到客户端后 header 不再挂起，
          这层 Suspense 已无内容可接，留着只会让人误以为它还会 suspend。 */}
      <SiteHeader />
      <main>{children}</main>
    </div>
  );
}
