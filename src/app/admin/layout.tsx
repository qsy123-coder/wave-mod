import Link from "next/link";
import { Suspense } from "react";
import { LayoutDashboard, LogOut, UploadCloud } from "lucide-react";

import { signOutAdmin } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { getCurrentUser } from "@/lib/supabase/server";

async function AdminUserEmail() {
  const user = await getCurrentUser();
  return <p className="mt-1 text-sm font-bold text-black/70">{user?.email ?? "未登录"}</p>;
}

function AdminUserEmailFallback() {
  return <p className="mt-1 text-sm font-bold text-black/70">加载账号…</p>;
}

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen" style={{ background: "var(--neo-dark)" }}>
      <header className="border-b-4 border-black" style={{ background: "var(--neo-nav)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <MotionReveal delay={0.04} rotate={-1}>
            <div className="inline-block border-4 border-black px-5 py-3 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-panel)" }}>
              <p className="neo-label text-black/60">WaveMod Admin</p>
              <h1 className="mt-2 text-lg font-black text-black">管理后台</h1>
              <Suspense fallback={<AdminUserEmailFallback />}>
                <AdminUserEmail />
              </Suspense>
            </div>
          </MotionReveal>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/upload" className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
              <UploadCloud className="size-4" />
              上传页面
            </Link>
            <Link href="/admin/mods" className="neo-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
              <LayoutDashboard className="size-4" />
              管理列表
            </Link>
            <Link href="/" className="neo-button-primary inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
              返回前台
            </Link>
            <form action={signOutAdmin}>
              <button type="submit" className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
                <LogOut className="size-4" />
                退出登录
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
