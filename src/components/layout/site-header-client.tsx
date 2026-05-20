"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Heart, LogIn, LogOut, Menu, Sparkles } from "lucide-react";

import { signOutUser } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { SiteSearchForm } from "@/components/layout/site-search-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { siteConfig } from "@/lib/constants/site";

type SiteHeaderClientProps = {
  isLoggedIn: boolean;
};

export function SiteHeaderClient({ isLoggedIn }: SiteHeaderClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loginHref = "/auth/login?mode=user&next=/favorites";
  const signOutAction = signOutUser.bind(null, "/");

  return (
    <header className="sticky top-0 z-50 border-b-4 border-black" style={{ background: "var(--neo-nav)" }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <MotionReveal delay={0.02} rotate={-2}>
          <Link
            href="/"
            className="neo-card flex -rotate-1 items-center gap-3 px-4 py-3"
            style={{ background: "var(--neo-accent)" }}
          >
            <span className="flex size-11 items-center justify-center border-4 border-black bg-white text-base font-black">
              W
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-[0.28em] text-black/70">
                WaveMod
              </p>
              <p className="text-sm font-black text-black">鸣潮角色MOD个人站</p>
            </div>
          </Link>
        </MotionReveal>

        <nav className="hidden items-center gap-2 lg:flex">
          {siteConfig.primaryNav.map((item, index) => (
            <MotionReveal key={item.href} delay={0.06 + index * 0.04} rotate={index % 2 === 0 ? 2 : -2}>
              <Link
                href={item.href}
                className={`border-2 border-transparent px-3 py-2 text-sm font-black uppercase tracking-[0.16em] text-black hover:border-black hover:shadow-[4px_4px_0px_0px_#000] ${index % 2 === 0 ? "rotate-1" : "-rotate-1"}`}
                style={{ background: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.35)" }}
              >
                {item.label}
              </Link>
            </MotionReveal>
          ))}
        </nav>

        <MotionReveal delay={0.14} className="ml-auto hidden md:block">
          <Suspense fallback={<div className="neo-card min-w-[280px] px-4 py-3 text-sm font-bold text-black/60" style={{ background: "var(--neo-search)" }}>加载搜索…</div>}>
            <SiteSearchForm />
          </Suspense>
        </MotionReveal>

        <ThemeToggle />

        <div className="hidden items-center gap-3 md:flex">
          <MotionReveal delay={0.18} rotate={1}>
            <Link href="/favorites" className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.16em]">
              <Heart className="size-4" />
              收藏
            </Link>
          </MotionReveal>
          <MotionReveal delay={0.2} rotate={-1}>
            {isLoggedIn ? (
              <form action={signOutAction}>
                <button type="submit" className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.16em]">
                  <LogOut className="size-4" />
                  退出
                </button>
              </form>
            ) : (
              <Link href={loginHref} className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.16em]">
                <LogIn className="size-4" />
                登录
              </Link>
            )}
          </MotionReveal>
          <MotionReveal delay={0.22} rotate={-1}>
            <Link href="/mods" className="neo-button-primary inline-flex -rotate-1 items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.16em]">
              <Sparkles className="size-4" />
              直链下载
            </Link>
          </MotionReveal>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            className="neo-button-outline ml-auto inline-flex items-center justify-center p-3 md:hidden"
            aria-label="打开移动端导航"
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent side="right" className="w-[86vw] border-l-4 border-black bg-[var(--neo-panel)] p-0 text-black" showCloseButton>
            <SheetHeader className="border-b-4 border-black bg-[var(--neo-accent)] px-5 py-4">
              <SheetTitle className="text-xl font-black uppercase tracking-[0.16em] text-black">站点导航</SheetTitle>
              <SheetDescription className="text-sm font-bold text-black/70">
                角色分类、安装教程、收藏入口都放在这里。
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 p-5">
              <Suspense fallback={<div className="neo-card px-4 py-3 text-sm font-bold text-black/60" style={{ background: "var(--neo-search)" }}>加载搜索…</div>}>
                <SiteSearchForm />
              </Suspense>

              <nav className="grid gap-3">
                {siteConfig.primaryNav.map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`border-4 border-black px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[6px_6px_0px_0px_#000] ${index % 3 === 0 ? "bg-[var(--neo-secondary)]" : index % 3 === 1 ? "bg-[var(--neo-muted)]" : "bg-white"}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="grid gap-3 border-t-4 border-black pt-4">
                <Link
                  href="/favorites"
                  onClick={() => setMobileOpen(false)}
                  className="neo-button-outline inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                >
                  <Heart className="size-4" />
                  收藏
                </Link>
                {isLoggedIn ? (
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      onClick={() => setMobileOpen(false)}
                      className="neo-button-outline inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                    >
                      <LogOut className="size-4" />
                      退出登录
                    </button>
                  </form>
                ) : (
                  <Link
                    href={loginHref}
                    onClick={() => setMobileOpen(false)}
                    className="neo-button-outline inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                  >
                    <LogIn className="size-4" />
                    登录
                  </Link>
                )}
                <Link
                  href="/mods"
                  onClick={() => setMobileOpen(false)}
                  className="neo-button-primary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                >
                  <Sparkles className="size-4" />
                  直链下载
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
