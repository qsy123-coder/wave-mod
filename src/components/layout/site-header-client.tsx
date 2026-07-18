"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LogIn, LogOut, Menu, Sparkles, Gamepad2 } from "lucide-react";

import { getEnabledGames } from "@/config/games";
import { signOutUser } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { SiteSearchForm } from "@/components/layout/site-search-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LayoutStyleToggle } from "@/components/layout/layout-style-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig } from "@/lib/constants/site";

type SiteHeaderClientProps = {
  isLoggedIn: boolean;
};

function getCurrentGameKey(pathname: string) {
  if (pathname.startsWith("/zenless-zone-zero")) return "zenless-zone-zero";
  if (pathname.startsWith("/genshin-impact")) return "genshin-impact";
  return "wuthering-waves"; // 默认（含 redirect 过来的根路径）
}

export function SiteHeaderClient({ isLoggedIn }: SiteHeaderClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isZzzRoute = pathname.startsWith("/zenless-zone-zero");
  const loginHref = "/auth/login?mode=user&next=/favorites";
  const signOutAction = signOutUser.bind(null, "/");
  const games = getEnabledGames();
  const currentGameKey = getCurrentGameKey(pathname);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-black/75 shadow-[0_4px_0px_0px_rgba(0,0,0,0.7)]">
      <div className="absolute inset-0 bg-[rgba(255,253,245,0.4)] backdrop-blur-md" />
      <div className="relative mx-auto flex w-full max-w-[1680px] items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
        {/* 左侧组：Logo + 游戏切换 + 导航 */}
        <div className="flex items-center gap-6">
        <MotionReveal delay={0.02} rotate={-2}>
          <Link
            href="/"
            className="neo-card flex -rotate-1 items-center gap-2 px-3 py-2"
            style={{ background: "var(--neo-accent)" }}
          >
            <span className="flex size-9 items-center justify-center border-[3px] border-black bg-white text-sm font-black">
              W
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.28em] text-black/70">
                WaveMod
              </p>
              <p className="text-xs font-black text-black">鸣潮角色MOD个人站</p>
            </div>
          </Link>
        </MotionReveal>

        <MotionReveal delay={0.04} rotate={1}>
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] md:inline-flex md:items-center md:gap-1.5">
              <Gamepad2 className="size-3.5" />游戏切换
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 border-4 border-black bg-[#fff8ef] p-2 text-black shadow-[8px_8px_0px_0px_#000]">
              <DropdownMenuLabel className="text-xs font-black uppercase tracking-[0.16em] text-black/60">选择 MOD 分站</DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2 h-1 bg-black" />
              {games.map((game, index) => {
                const isActive = game.key === currentGameKey;
                return (
                <DropdownMenuItem key={game.key} className="cursor-pointer p-0 focus:bg-transparent">
                  <Link
                    href={game.nav.home}
                    onClick={(e) => { if (isActive) e.preventDefault(); }}
                    className={`flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black text-black shadow-[4px_4px_0px_0px_#000] ${
                      isActive
                        ? "bg-black text-white border-white"
                        : index % 3 === 0 ? "bg-[#ffd84f]" : index % 3 === 1 ? "bg-[#ff7a7a]" : "bg-[#bcaeff]"
                    }`}
                  >
                    <span>{game.name} {isActive ? "✓" : ""}</span>
                    <span className="text-[10px] uppercase tracking-[0.16em]">{game.shortName}</span>
                  </Link>
                </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </MotionReveal>

        <nav className="hidden items-center gap-1.5 lg:flex">
          {siteConfig.primaryNav.map((item, index) => (
            <MotionReveal key={item.href} delay={0.06 + index * 0.04} rotate={index % 2 === 0 ? 2 : -2}>
              <Link
                href={item.href}
                className={`border-2 border-transparent px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-black hover:border-black hover:shadow-[4px_4px_0px_0px_#000] ${index % 2 === 0 ? "rotate-1" : "-rotate-1"}`}
                style={{ background: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.35)" }}
              >
                {item.label}
              </Link>
            </MotionReveal>
          ))}
        </nav>
        </div>

        {/* 中间搜索 */}
        <MotionReveal delay={0.14} className="hidden flex-1 md:block max-w-md mx-4">
          <Suspense fallback={<div className="neo-card min-w-[280px] px-4 py-3 text-sm font-bold text-black/60" style={{ background: "var(--neo-search)" }}>加载搜索…</div>}>
            <SiteSearchForm />
          </Suspense>
        </MotionReveal>

        {/* 右侧组：主题切换 + 按钮 */}
        <div className="flex items-center gap-4">
        <ThemeToggle />

        {isZzzRoute && <LayoutStyleToggle variant="neo" />}

        <div className="hidden items-center gap-4.5 md:flex">
          <MotionReveal delay={0.18} rotate={1}>
            <Link href="/favorites" className="neo-button-outline inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
              <Heart className="size-3.5" />
              收藏
            </Link>
          </MotionReveal>
          <MotionReveal delay={0.2} rotate={-1}>
            {isLoggedIn ? (
              <form action={signOutAction}>
                <button type="submit" className="neo-button-outline inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
                  <LogOut className="size-3.5" />
                  退出
                </button>
              </form>
            ) : (
              <Link href={loginHref} className="neo-button-outline inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
                <LogIn className="size-3.5" />
                登录
              </Link>
            )}
          </MotionReveal>
          <MotionReveal delay={0.22} rotate={-1}>
            <Link href="/mods" className="neo-button-primary inline-flex -rotate-1 items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
              <Sparkles className="size-3.5" />
              直链下载
            </Link>
          </MotionReveal>
        </div>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            className="neo-button-outline ml-auto inline-flex items-center justify-center p-2 md:hidden"
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
                <div className="border-4 border-black bg-[#ffd84f] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
                  游戏切换
                </div>
                {games.map((game, index) => {
                  const isActive = game.key === currentGameKey;
                  return (
                  <Link
                    key={game.key}
                    href={game.nav.home}
                    onClick={(e) => { if (isActive) { e.preventDefault(); } setMobileOpen(false); }}
                    className={`border-4 border-black px-4 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000] ${
                      isActive
                        ? "bg-black text-white border-white"
                        : index % 3 === 0 ? "bg-[#ffd84f] text-black" : index % 3 === 1 ? "bg-[#ff7a7a] text-black" : "bg-[#bcaeff] text-black"
                    }`}
                  >
                    {game.name} MOD {isActive ? "✓" : ""}
                  </Link>
                  );
                })}
              </nav>

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
