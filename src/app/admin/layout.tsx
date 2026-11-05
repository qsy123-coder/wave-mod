import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";

import { adminLogoutAction } from "@/actions/admin/auth-actions";
import { SiteHeader } from "@/components/layout/site-header";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

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
  // 访问控制已上移到 proxy.ts（Cookie 验签 / Basic Auth）。
  // 这里只读 Cookie 是否存在，用来决定要不要显示后台工具条 —— 登录页没有会话，自然不显示。
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  return (
    <div className="min-h-screen" style={{ background: "var(--neo-dark)" }}>
      {/* 与 (site)/(home) 同一处改动：登录态搬到客户端后 header 不再挂起，
          这层 Suspense 已无内容可接，留着只会让人误以为它还会 suspend。 */}
      <SiteHeader />

      {hasSession ? (
        <div className="border-b-4 border-black bg-black">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white sm:px-6 lg:px-8">
            <Link href="/admin/batch-upload" className="hover:text-[var(--neo-accent)]">
              批量上传
            </Link>
            <span className="text-white/30">/</span>
            <Link href="/admin/mods" className="hover:text-[var(--neo-accent)]">
              后台列表
            </Link>
            <span className="text-white/30">/</span>
            <Link href="/admin/upload" className="hover:text-[var(--neo-accent)]">
              单条上传
            </Link>

            <form action={adminLogoutAction} className="ml-auto">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 border-2 border-white/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-white hover:text-white"
              >
                <LogOut className="size-3" />
                退出登录
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <main>{children}</main>
    </div>
  );
}
