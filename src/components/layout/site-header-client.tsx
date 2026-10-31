"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, LayoutDashboard, LogIn, LogOut, Menu, Sparkles, UploadCloud, Gamepad2, BookOpen, ChevronDown, UserRound } from "lucide-react";

import { getEnabledGames } from "@/config/games";
import { signOutUser } from "@/actions/auth/auth-actions";
import { useSession } from "@/components/features/auth/session-provider";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import { MobileCharacterNav } from "@/components/layout/mobile-character-nav";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { SiteSearchForm } from "@/components/layout/site-search-form";
import { useSitePreferences } from "@/components/layout/site-preferences-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useIsDesktop } from "@/components/layout/use-is-desktop";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig } from "@/lib/constants/site";
import { GALLERY_BACK_KEY } from "@/lib/constants/gallery-nav";
import { LOGIN_BACK_KEY } from "@/lib/constants/auth-nav";
import { isCurrentNavigationUrl, isPlainLeftClick } from "@/lib/navigation-url";
import { isImmersiveActive } from "@/lib/preferences/site-preferences";
import { cn } from "@/lib/utils";

type SiteHeaderClientProps = {
  /** 顶部附加条（首页"近期上新"滚动通知），渲染在导航行上方 */
  topBar?: React.ReactNode;
};

function getCurrentGameKey(pathname: string) {
  if (pathname.startsWith("/zenless-zone-zero")) return "zenless-zone-zero";
  if (pathname.startsWith("/genshin-impact")) return "genshin-impact";
  return "wuthering-waves"; // 默认（含 redirect 过来的根路径）
}

/**
 * 当前所在 URL（路径 + 查询串）。
 *
 * 只在**事件处理里**调用。以前这里是从 `useSearchParams()` 渲染期算出来的，
 * 但那会让整个组件树逃逸出预渲染 —— 预渲染 HTML 里会留下 Suspense 的 fallback，
 * 也就是**每个页面的 HTML 里都变成骨架屏而不是导航栏**。
 *
 * 这三个用途（判断"点了自己"、记录图库/登录的来源页）本来就都发生在点击那一刻，
 * 那时 `window.location` 才是唯一的真相 —— 客户端导航后渲染期的值反而可能是旧的。
 */
function getCurrentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

/** 下拉菜单条目：与导航的 neo 卡片同一套黑框 + 硬阴影 */
const DROPDOWN_ITEM_CLASS =
  "flex w-full items-center gap-2 border-4 border-black bg-white px-3 py-2 text-xs font-black text-black shadow-[3px_3px_0px_0px_#000] transition hover:bg-[var(--neo-secondary)]";

/** 桌面一级导航链接 / 下拉触发器共用的字号与 hover */
const DESKTOP_NAV_LINK_CLASS =
  "inline-flex items-center gap-1 border-2 border-transparent px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-[var(--neo-on-nav)] hover:border-black hover:shadow-[4px_4px_0px_0px_#000] whitespace-nowrap";

/**
 * PC 端一级导航的常驻项：角色分类 + 教程。
 *
 * 按 href 挑而不是 `slice(0, n)`：primaryNav 的顺序同时被手机抽屉复用，
 * 手写下标会让「改 PC 导航」顺手把手机端的入口也换掉。
 * 图库移进「更多」——它是浏览型页面，点进去就是独立 layout，不属于高频入口。
 */
const DESKTOP_PRIMARY_NAV_HREFS = new Set(["/mods", "/guide"]);
const DESKTOP_PRIMARY_NAV = siteConfig.primaryNav.filter((item) =>
  DESKTOP_PRIMARY_NAV_HREFS.has(item.href),
);
const DESKTOP_MORE_NAV = siteConfig.primaryNav.filter(
  (item) => !DESKTOP_PRIMARY_NAV_HREFS.has(item.href),
);

/** 手机抽屉里的折叠分组标题（原生 details/summary，不依赖 JS） */
const MOBILE_DETAILS_SUMMARY_CLASS =
  "flex cursor-pointer list-none items-center justify-between border-4 border-black bg-[var(--neo-secondary)] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000] [&::-webkit-details-marker]:hidden";

export function SiteHeaderClient({ topBar }: SiteHeaderClientProps) {
  // 登录态来自客户端 cookie（零网络），不再由服务端下发 —— 服务端读 cookie 会让
  // 所有用到 header 的页面无法静态化。详见 session-provider.tsx。
  //
  // 会话尚未就绪时（status === "loading"，只在硬加载的头一两帧）**按未登录渲染**：
  // 这样预渲染 HTML 里是一个**可见、可点**的「登录」按钮，匿名访客与爬虫（流量的
  // 绝大多数）从一开始看到的就是对的，也不需要 JS 才能用。
  //
  // 代价是已登录用户在硬加载时会看到「登录」闪一下再变「退出」。另一种做法是就绪前
  // `visibility: hidden` 占位（布局不跳），但那样在 JS 加载慢时**所有人**都会看到一块
  // 空白、且无 JS 时登录入口直接消失 —— 两害相权，宁愿只让已登录用户看到一次文字切换。
  // 管理入口同理：`isAdmin` 只有在查询回来后才会为 true，因此它由 false 变 true 时会有
  // 一次出现动画；受害者只有管理员本人（ADMIN_EMAIL / ADMIN_PHONES 里那一个账号）。
  const { isLoggedIn, isAdmin } = useSession();
  // 站点偏好：直达分类（账户下拉里的勾选项）与沉浸布局（/mods 收起导航栏）
  const { autoOpenMods, setAutoOpenMods, immersive } = useSitePreferences();
  const isDesktop = useIsDesktop();
  const [mobileOpen, setMobileOpen] = useState(false);
  // 手机抽屉里的「全部角色分类」默认收起：60+ 个格子铺开会把后面的入口全推到
  // 几屏之外。展开时才让 MobileCharacterNav 去拉清单（open 即 enabled）。
  const [charactersExpanded, setCharactersExpanded] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navRowRef = useRef<HTMLDivElement>(null);

  // 用 ResizeObserver 实测 header 高度，写入 CSS 变量供各"占满余下视口"的外壳自适应
  // （首页 SnapContainer、/mods 应用壳都用 --site-header-h 减掉头部高度）。
  // 顶部"近期更新的外观资源"横条开/关会改变 header 高度；若外壳高度不跟随，
  // header 变矮后网格几何断裂，scroll-snap(mandatory) 会把视口拽到第二屏边缘。
  // 同时另存一个"仅导航栏行"的基准高度 --home-hero-h：横条开/关不改变导航栏行高度，
  // 首页 Hero 用该恒定值居中，保证大卡片与导航栏的间距在横条开关两种状态下一致。
  useEffect(() => {
    const header = headerRef.current;
    const navRow = navRowRef.current;
    if (!header || !navRow) return;
    const update = () => {
      const h = header.getBoundingClientRect().height;
      if (h > 0) document.documentElement.style.setProperty("--site-header-h", `${Math.round(h)}px`);
      const border = parseFloat(getComputedStyle(header).borderBottomWidth) || 0;
      const base = navRow.getBoundingClientRect().height + border;
      document.documentElement.style.setProperty("--home-hero-h", `${Math.round(base)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    ro.observe(navRow);
    return () => ro.disconnect();
  }, []);
  const pathname = usePathname();
  /**
   * 沉浸布局真正生效时才收起 header。
   *
   * 判据必须包含「当前在 /mods」：状态是持久化的，用户从 /mods 点去教程页时
   * header 要立刻回来，否则导航入口就消失了。
   */
  const headerImmersive = isImmersiveActive({ immersive, isDesktop, pathname });
  const { startPageLoading } = useNavigationLoading();
  const isZzzRoute = pathname.startsWith("/zenless-zone-zero");
  const isAdminRoute = pathname.startsWith("/admin");
  const loginHref = "/auth/login?mode=user&next=/favorites";
  const signOutAction = signOutUser.bind(null, "/");
  const games = getEnabledGames();
  const currentGameKey = getCurrentGameKey(pathname);
  const currentGameName = games.find((game) => game.key === currentGameKey)?.name ?? "主站";

  /**
   * 顶部导航任意链接点击 → 立即站点级骨架屏。
   *
   * ⚠️ **不要在这里判 `e.defaultPrevented`。**
   *
   * 原先的第一句是 `if (e.defaultPrevented) return;`，本意是「别人已经处理过这次点击了」。
   * 但 Next 的 `<Link>` 在做客户端导航时**自己就会调 `preventDefault()`**，而它在**目标
   * 节点**上执行、事件冒泡到 `<header>` 时标志早已置上 ⇒ 这个守卫把**每一次**链接点击都
   * 挡掉了，`startPageLoading()` 从来没被调用过，整套站点级骨架是死代码。
   * （2026-10-16 实测：点导航链接时 `defaultPrevented` 为 true，骨架采样命中 0 次。）
   *
   * 换成逐个显式判掉「点了也不会跳到新页」的几种情形，剩下的才起骨架。
   */
  const handleHeaderNavClick = (e: React.MouseEvent) => {
    // 带修饰键 / 中键的点击是「在新标签页打开」，当前页压根不动 —— 起骨架只会盖住
    // 用户还在看的这一页。与 mod-card、character-sidebar 同一口径（共用 isPlainLeftClick）。
    if (!isPlainLeftClick(e)) return;
    const anchor = (e.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto")) return;
    // 显式标了「这就是当前所在、点了不会跳」的链接（当前分站那两个），跳过。
    // 它们的 onClick 里会 preventDefault，但我们**不能**靠 defaultPrevented 反推 ——
    // 见上面那段：Next 的 Link 对正常导航同样会 preventDefault，两者没法区分。
    if (anchor.hasAttribute("data-nav-skip")) return;
    // 用语义判等（参数顺序 / 尾斜杠 / 百分号编码差异都不算差异），
    // 口径与侧边栏筛选链接一致（两处共用 navigation-url.ts）。
    if (isCurrentNavigationUrl(href)) {
      e.preventDefault();
      return;
    }
    // 把目标 href 一起带上 —— 覆盖层要靠它挑「目标页面自己的那套骨架」
    startPageLoading(href);
  };

  // 点击导航里"图库"进入 /gallery 时，记录当前来源页，供图库返回按钮一步跳回。
  // 图库是独立 layout（无 header），来源页只能在"点击进入"这一刻捕获。
  const handleGalleryEntry = (href: string) => {
    if (href === "/gallery") {
      try {
        sessionStorage.setItem(GALLERY_BACK_KEY, getCurrentUrl());
      } catch {
        /* sessionStorage 不可用时忽略，返回按钮会走 referrer 兜底 */
      }
    }
  };

  // 点击"登录"进入 /auth/login 时，记录当前来源页，供登录页返回按钮一步跳回。
  // 登录页同样是独立 layout（无 header），必须放在 Link 自身 onClick 里记录——<Link>
  // 内部会 preventDefault，header 级 onClick（handleHeaderNavClick）此时已 defaultPrevented
  // 而提前 return，走不到这里。
  const handleLoginEntry = (href: string) => {
    if (href.startsWith("/auth/login")) {
      try {
        sessionStorage.setItem(LOGIN_BACK_KEY, getCurrentUrl());
      } catch {
        /* sessionStorage 不可用时忽略，返回按钮会走 referrer / 首页兜底 */
      }
    }
  };

  return (
    <header
      ref={headerRef}
      className={cn(
        // Tailwind v4 的 translate 工具类写的是 **`translate` 属性**（不是 `transform`），
        // 所以过渡属性必须写 `translate,opacity`；写 `transform` 会变成瞬移。
        "sticky top-0 z-50 border-b-4 border-black transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none will-change-[translate,opacity]",
        headerImmersive && "-translate-y-full opacity-0 pointer-events-none",
      )}
      style={{ background: "var(--neo-nav)" }}
      onClick={handleHeaderNavClick}
      // 收起到视口外后不能再被 Tab 聚焦（`display` 没变，必须显式 inert）
      inert={headerImmersive || undefined}
      aria-hidden={headerImmersive || undefined}
    >
      {topBar}
      <div ref={navRowRef} className="mx-auto flex w-full max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* 左侧组：Logo + 游戏切换 + 导航 */}
        <div className="flex items-center gap-4">
        <MotionReveal delay={0.02} rotate={-2}>
          <Link
            href="/"
            prefetch={false}
            className="neo-card neo-card-sm flex shrink-0 -rotate-1 items-center gap-1.5 px-3 py-1.5"
            style={{ background: "var(--neo-accent)" }}
          >
            <span className="flex size-7 items-center justify-center border-[3px] border-black bg-white text-xs font-black text-black">
              X
            </span>
            <div className="min-w-0 whitespace-nowrap">
              <p className="truncate text-[8px] font-black uppercase leading-[1.15] tracking-[0.16em] text-black/70">
                XINGLAN
              </p>
              <p className="text-[11px] font-black leading-[1.15] text-black">星澜资源站</p>
            </div>
          </Link>
        </MotionReveal>

        <MotionReveal delay={0.04} rotate={1}>
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden border-[3px] border-black bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#000] md:inline-flex md:items-center md:gap-1.5 md:whitespace-nowrap">
              <Gamepad2 className="size-3" />游戏切换
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 border-4 border-black bg-[var(--neo-panel)] p-2 text-black shadow-[8px_8px_0px_0px_#000]" onClick={handleHeaderNavClick}>
              <DropdownMenuLabel className="text-xs font-black uppercase tracking-[0.16em] text-black/60">选择分站</DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2 h-1 bg-black" />
              {games.map((game, index) => {
                const isActive = game.key === currentGameKey;
                return (
                <DropdownMenuItem key={game.key} className="cursor-pointer p-0 focus:bg-transparent">
                  <Link
                    href={game.nav.home}
                    onClick={(e) => { if (isActive) e.preventDefault(); }}
                    // 当前分站：点了不会跳，别起骨架屏（见 handleHeaderNavClick）
                    data-nav-skip={isActive ? "" : undefined}
                    className={`flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black text-black shadow-[4px_4px_0px_0px_#000] ${
                      isActive
                        ? "bg-black text-white border-white"
                        : index % 3 === 0 ? "bg-[var(--neo-secondary)]" : index % 3 === 1 ? "bg-[var(--neo-accent)]" : "bg-[var(--neo-muted)]"
                    }`}
                  >
                    <span>{game.name} {isActive ? "✓" : ""}</span>
                    {/* name 与 shortName 相同时不重复渲染（改中性代号后三个分站都是这种情形） */}
                    {game.shortName !== game.name ? (
                      <span className="text-[10px] uppercase tracking-[0.16em]">{game.shortName}</span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </MotionReveal>

        {/* 导航链接一律 `prefetch={false}`。
            App Router 默认会在链接进入视口时预取目标路由的 RSC payload —— 头部
            首屏可见的链接有七八个（导航 + 收藏 + 登录 + 直链下载），实测第一帧
            就发出约 50 个预取请求、67 KB，和首屏图抢同一条链路，把 LCP 从
            ~0.8s 推到 ~10s（2026-10-16，本地生产构建 + CDP 模拟 150ms RTT / 4Mbps）。
            站内已有导航骨架屏兜底（PageLoadingOverlay），点击后的等待感不会更差。 */}
        {/*
         * 一级入口只留角色分类 / 教程；图库、问题解答、转载声明收进「更多」。
         * 此前五个链接 + 游戏切换 + 搜索 + 四个右侧按钮挤在一行，1440 下已经
         * 没有呼吸空间，低频页面没必要常驻。
         */}
        <nav className="hidden items-center gap-2 min-[1360px]:flex">
          {isAdminRoute ? (
            <>
              <MotionReveal delay={0.06} rotate={2}>
                <Link href="/admin/mods" className={DESKTOP_NAV_LINK_CLASS}>
                  管理列表
                </Link>
              </MotionReveal>
              <MotionReveal delay={0.1} rotate={-2}>
                <DropdownMenu>
                  <DropdownMenuTrigger className={DESKTOP_NAV_LINK_CLASS}>
                    更多
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-44 border-4 border-black bg-[var(--neo-panel)] p-2 text-black shadow-[8px_8px_0px_0px_#000]"
                    onClick={handleHeaderNavClick}
                  >
                    {[
                      { href: "/admin/upload", label: "上传页面" },
                      { href: "/admin/tutorial", label: "教程管理" },
                      { href: "/", label: "返回前台" },
                    ].map((item) => (
                      <DropdownMenuItem key={item.href} className="cursor-pointer p-0 focus:bg-transparent">
                        <Link href={item.href} prefetch={false} className={DROPDOWN_ITEM_CLASS}>
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </MotionReveal>
            </>
          ) : (
            <>
              {DESKTOP_PRIMARY_NAV.map((item, index) => (
                <MotionReveal key={item.href} delay={0.06 + index * 0.04} rotate={index % 2 === 0 ? 2 : -2}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={() => handleGalleryEntry(item.href)}
                    className={DESKTOP_NAV_LINK_CLASS}
                  >
                    {item.label}
                  </Link>
                </MotionReveal>
              ))}
              <MotionReveal delay={0.14} rotate={2}>
                <DropdownMenu>
                  <DropdownMenuTrigger className={DESKTOP_NAV_LINK_CLASS}>
                    更多
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-44 border-4 border-black bg-[var(--neo-panel)] p-2 text-black shadow-[8px_8px_0px_0px_#000]"
                    onClick={handleHeaderNavClick}
                  >
                    {DESKTOP_MORE_NAV.map((item) => (
                      <DropdownMenuItem key={item.href} className="cursor-pointer p-0 focus:bg-transparent">
                        <Link
                          href={item.href}
                          prefetch={false}
                          onClick={() => handleGalleryEntry(item.href)}
                          className={DROPDOWN_ITEM_CLASS}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </MotionReveal>
            </>
          )}
        </nav>
        </div>

        {/* 中间搜索 */}
        <MotionReveal delay={0.14} className="hidden max-w-[400px] flex-1 md:block mx-2">
          <Suspense fallback={<div className="neo-card min-w-[200px] px-3 py-1.5 text-xs font-bold text-black/60" style={{ background: "var(--neo-search)" }}>加载搜索…</div>}>
            <SiteSearchForm />
          </Suspense>
        </MotionReveal>

        {/* 右侧组：主题切换 + 按钮 */}
        <div className="flex shrink-0 items-center gap-2.5">
        <ThemeToggle />

        {isZzzRoute && <LayoutStyleToggle variant="neo" />}

        <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
          {/* 收藏 / 登录退出 / 管理入口收进一个「账户」下拉。
              以前它们是三到五个并排的卡片，仅右侧就占了半条导航。 */}
          {!isAdminRoute && (
            <MotionReveal delay={0.18} rotate={1}>
              <DropdownMenu>
                <DropdownMenuTrigger className="neo-button-outline inline-flex items-center gap-1 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.1em] whitespace-nowrap">
                  <UserRound className="size-3" />
                  账户
                  <ChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-4 border-black bg-[var(--neo-panel)] p-2 text-black shadow-[8px_8px_0px_0px_#000]"
                  onClick={handleHeaderNavClick}
                >
                  <DropdownMenuItem className="cursor-pointer p-0 focus:bg-transparent">
                    <Link href="/favorites" prefetch={false} className={DROPDOWN_ITEM_CLASS}>
                      <Heart className="size-3.5" />
                      收藏
                    </Link>
                  </DropdownMenuItem>
                  {/*
                    直达角色分类：与 /mods 工具栏的「直达分类」是同一个状态
                    （同一个 Provider + 同一个 localStorage key）。关掉之后访问首页
                    才会正常看到首页；开着时只能在 /mods 关回来。

                    ⚠️ 用 onClick 而不是 onSelect：项目的 dropdown-menu 是自研的普通
                    <button>（见 components/ui/dropdown-menu.tsx），Radix 的 onSelect
                    在这里会被当成普通属性丢掉，点击毫无反应（2026-10-31 实测）。
                  */}
                  <DropdownMenuCheckboxItem
                    checked={autoOpenMods}
                    onClick={() => setAutoOpenMods(!autoOpenMods)}
                    className={DROPDOWN_ITEM_CLASS}
                  >
                    <Home className="size-3.5" />
                    直达角色分类
                  </DropdownMenuCheckboxItem>
                  {/* 管理员专属入口：与后台守卫同源判定，非管理员不渲染 */}
                  {isAdmin ? (
                    <>
                      <DropdownMenuItem className="cursor-pointer p-0 focus:bg-transparent">
                        <Link href="/admin/mods" prefetch={false} className={DROPDOWN_ITEM_CLASS}>
                          <LayoutDashboard className="size-3.5" />
                          管理列表
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer p-0 focus:bg-transparent">
                        <Link href="/admin/upload" prefetch={false} className={DROPDOWN_ITEM_CLASS}>
                          <UploadCloud className="size-3.5" />
                          上传
                        </Link>
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  <DropdownMenuSeparator className="my-2 h-1 bg-black" />
                  {isLoggedIn ? (
                    <form action={signOutAction}>
                      <button type="submit" className={DROPDOWN_ITEM_CLASS}>
                        <LogOut className="size-3.5" />
                        退出登录
                      </button>
                    </form>
                  ) : (
                    <DropdownMenuItem className="cursor-pointer p-0 focus:bg-transparent">
                      <Link
                        href={loginHref}
                        prefetch={false}
                        onClick={() => handleLoginEntry(loginHref)}
                        className={DROPDOWN_ITEM_CLASS}
                      >
                        <LogIn className="size-3.5" />
                        登录
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </MotionReveal>
          )}
          {!isAdminRoute && (
            <MotionReveal delay={0.22} rotate={-1}>
              <Link href="/mods" prefetch={false} className="neo-button-primary inline-flex -rotate-1 items-center gap-1 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.1em] whitespace-nowrap">
                <Sparkles className="size-3" />
                直链下载
              </Link>
            </MotionReveal>
          )}
          {/* 后台路由：只保留一个退出登录 */}
          {isAdminRoute && (
            <MotionReveal delay={0.2} rotate={-1}>
              <form action={signOutAction}>
                <button type="submit" className="neo-button-outline inline-flex items-center gap-1 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.1em] whitespace-nowrap">
                  <LogOut className="size-3" />
                  退出登录
                </button>
              </form>
            </MotionReveal>
          )}
        </div>
        </div>

        {/*
         * 手机导航栏的风格切换入口（`md:hidden`，桌面上由右侧组里的 `ThemeToggle` 负责）。
         * 放在汉堡左侧，用 `ml-auto` 把「风格 + 汉堡」一起推到最右边 —— 手机上中间的
         * 搜索框是 `hidden md:block`，没有别的 flex-1 元素能承担这个推力。
         */}
        <ThemeToggle variant="bar" />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            className="neo-button-outline inline-flex items-center justify-center p-2 min-[1360px]:hidden"
            aria-label="打开移动端导航"
          >
            <Menu className="size-4" />
          </SheetTrigger>
          {/*
           * 高度撑满 + 内容区自己滚的三段式：`flex-col gap-0`（顶栏固定、内容区吃满余高），
           * `SheetHeader` 加 shrink-0 不被压缩，内容区 `min-h-0 flex-1 overflow-y-auto`。
           *
           * 为什么非做不可：SheetContent 打开时会把 `document.body.style.overflow` 锁成
           * hidden（见 sheet.tsx），内容区若没有自己的 overflow，超出的部分就**既看不见
           * 也滚不到** —— 手机上加进「全部角色分类」六十多个格子后必然溢出。
           *
           * 只在这里传 className，**不动 sheet.tsx**：那个文件被 /mods 的角色抽屉与详情页
           * 右抽屉共用，改它会波及那两处。同一套写法在 character-picker-drawer.tsx 已验证过。
           */}
          <SheetContent side="right" className="flex w-[86vw] flex-col gap-0 border-l-4 border-black bg-[var(--neo-panel)] p-0 text-black" showCloseButton>
            <SheetHeader className="shrink-0 border-b-4 border-black bg-[var(--neo-accent)] px-5 py-4">
              <SheetTitle className="text-xl font-black uppercase tracking-[0.16em] text-black">站点导航</SheetTitle>
              <SheetDescription className="text-sm font-bold text-black/70">
                角色分类、安装教程、收藏入口都放在这里。
              </SheetDescription>
            </SheetHeader>

            <div data-slot="mobile-nav-scroll" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onClick={handleHeaderNavClick}>
              <Suspense fallback={<div className="neo-card px-4 py-3 text-sm font-bold text-black/60" style={{ background: "var(--neo-search)" }}>加载搜索…</div>}>
                <SiteSearchForm />
              </Suspense>

              {/* 主入口只留三张卡；低频页面收进「更多页面」，游戏切换与
                  六十多个角色格各自折叠 —— 以前它们全是平铺的大卡，抽屉要滚好几屏。 */}
              <nav className="grid grid-cols-3 gap-2">
                {siteConfig.primaryNav.slice(0, 3).map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => { setMobileOpen(false); handleGalleryEntry(item.href); }}
                    className={`flex items-center justify-center border-4 border-black px-2 py-3 text-center text-[11px] font-black leading-tight tracking-[0.06em] text-black shadow-[4px_4px_0px_0px_#000] ${index % 3 === 0 ? "bg-[var(--neo-secondary)]" : index % 3 === 1 ? "bg-[var(--neo-muted)]" : "bg-white"}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <details className="group">
                <summary className={MOBILE_DETAILS_SUMMARY_CLASS}>
                  更多页面
                  <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <nav className="mt-2 grid gap-2">
                  {siteConfig.primaryNav.slice(3).map((item, index) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { setMobileOpen(false); handleGalleryEntry(item.href); }}
                      className={`border-4 border-black px-4 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000] ${index % 2 === 0 ? "bg-[var(--neo-muted)]" : "bg-white"}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </details>

              <details className="group">
                <summary className={MOBILE_DETAILS_SUMMARY_CLASS}>
                  <span className="min-w-0 truncate">游戏切换 · {currentGameName}</span>
                  <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <nav className="mt-2 grid gap-2">
                  {games.map((game, index) => {
                    const isActive = game.key === currentGameKey;
                    return (
                      <Link
                        key={game.key}
                        href={game.nav.home}
                        onClick={(e) => { if (isActive) { e.preventDefault(); } setMobileOpen(false); }}
                        // 当前分站：点了不会跳，别起骨架屏（见 handleHeaderNavClick）
                        data-nav-skip={isActive ? "" : undefined}
                        className={`border-4 border-black px-4 py-2.5 text-sm font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] ${
                          isActive
                            ? "bg-black text-white border-white"
                            : index % 3 === 0 ? "bg-[var(--neo-secondary)] text-black" : index % 3 === 1 ? "bg-[var(--neo-accent)] text-black" : "bg-[var(--neo-muted)] text-black"
                        }`}
                      >
                        {game.name} {isActive ? "✓" : ""}
                      </Link>
                    );
                  })}
                </nav>
              </details>

              {/* 全部角色分类：手机端唯一的按角色浏览入口。
                  /mods 的角色侧栏是 `hidden … lg:block`，那个 CharacterPickerDrawer
                  也挂在侧栏内部跟着被隐藏，所以这里必须补一份。
                  每一项是一个**具体角色**，点了进该角色的资源列表（/mods?character=…）。
                  默认收起：60+ 个格子铺开会把下面的入口推到好几屏之外；展开时才拉清单。 */}
              <details
                className="group"
                onToggle={(event) => setCharactersExpanded(event.currentTarget.open)}
              >
                <summary className={MOBILE_DETAILS_SUMMARY_CLASS}>
                  全部角色分类
                  <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2">
                  <MobileCharacterNav
                    open={mobileOpen && charactersExpanded}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </details>

              {/* 移动端风格切换入口：桌面端那个下拉是 hidden md:block，
                  手机上原本没有任何换肤入口。 */}
              <div className="border-t-4 border-black pt-4">
                <ThemeToggle variant="mobile" />
              </div>

              <div className="grid gap-3 border-t-4 border-black pt-4">
                <Link
                  href="/favorites"
                  onClick={() => setMobileOpen(false)}
                  className="neo-button-outline inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                >
                  <Heart className="size-4" />
                  收藏
                </Link>
                {/* 管理员专属入口（移动端） */}
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/mods"
                      onClick={() => setMobileOpen(false)}
                      className="neo-button-secondary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                    >
                      <LayoutDashboard className="size-4" />
                      管理列表
                    </Link>
                    <Link
                      href="/admin/upload"
                      onClick={() => setMobileOpen(false)}
                      className="neo-button-outline inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                    >
                      <UploadCloud className="size-4" />
                      上传
                    </Link>
                    <Link
                      href="/admin/tutorial"
                      onClick={() => setMobileOpen(false)}
                      className="neo-button-secondary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                    >
                      <BookOpen className="size-4" />
                      教程管理
                    </Link>
                  </>
                )}
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
                    onClick={() => {
                      setMobileOpen(false);
                      handleLoginEntry(loginHref);
                    }}
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
