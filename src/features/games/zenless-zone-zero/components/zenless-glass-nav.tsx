import { Suspense } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Heart,
  LogIn,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";

import { signOutUser } from "@/actions/auth/auth-actions";
import { getEnabledGames, type GameConfig } from "@/config/games";
import { getCurrentUser } from "@/lib/supabase/server";
import { LayoutStyleToggle } from "@/components/layout/layout-style-toggle";
import { ZenlessNavAuthSkeleton } from "./zenless-mods-skeletons";

const zenlessNavItems = [
  { label: "首页", href: "/zenless-zone-zero" },
  { label: "角色分类", href: "/zenless-zone-zero/mods" },
  { label: "排行榜", href: "/zenless-zone-zero/ranking" },
  { label: "个人中心", href: "/zenless-zone-zero/profile" },
  { label: "先看我", href: "/zenless-zone-zero/guide" },
  { label: "支持本站", href: "/zenless-zone-zero/support" },
] as const;

type ZenlessGlassNavProps = {
  game: GameConfig;
};

async function ZenlessNavAuthAction({ game }: { game: GameConfig }) {
  const user = await getCurrentUser();
  const signOutAction = signOutUser.bind(null, game.nav.home);

  return user ? (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 border-2 border-black bg-white px-3 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:bg-white"
      >
        <LogOut className="size-3.5" />
        退出
      </button>
    </form>
  ) : (
    <Link
      href={`/auth/login?mode=user&next=${encodeURIComponent(game.nav.home)}`}
      className="inline-flex h-9 items-center gap-1.5 border-2 border-black bg-white px-3 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:bg-white"
    >
      <LogIn className="size-3.5" />
      登录
    </Link>
  );
}

export function ZenlessGlassNav({ game }: ZenlessGlassNavProps) {
  const games = getEnabledGames();
  const getSwitchHref = (gameItem: GameConfig) =>
    gameItem.key === "wuthering-waves" ? "/" : gameItem.nav.home;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-black/75 text-black shadow-[0_4px_0px_0px_rgba(0,0,0,0.7)]">
      <div className="absolute  inset-0 bg-[rgba(255,253,245,0.01)] backdrop-blur-[2px]" />
      <div className="relative mx-auto flex h-[58px] w-full max-w-[1680px] items-center gap-2 px-2 sm:px-3 lg:px-3 xl:px-4">
        <Link
          href={game.nav.home}
          className="group flex min-w-0 items-center gap-2"
        >
          <div className="flex size-9 -rotate-2 items-center justify-center border-4 border-black bg-[var(--neo-accent)] text-base font-black text-black shadow-[3px_3px_0px_0px_#000] transition duration-100 group-hover:-translate-y-0.5 group-hover:shadow-[5px_5px_0px_0px_#000]">
            Z
          </div>
          <div className="hidden leading-none sm:block">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-black">
              WaveMod
            </p>
            <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/62">
              绝区零 MOD 分站
            </p>
          </div>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {zenlessNavItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`border-2 border-black px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition duration-100 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] ${index === 0 ? "bg-[var(--neo-accent)] -rotate-1" : index === 1 ? "bg-white rotate-1" : index === 2 ? "bg-[var(--neo-secondary)] -rotate-1" : "bg-[var(--neo-muted)] rotate-1"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <form
            action={game.nav.mods}
            className="hidden h-9 w-[170px] items-center gap-1.5 border-2 border-black bg-white px-3 text-black shadow-[3px_3px_0px_0px_#000] transition focus-within:-translate-y-0.5 focus-within:bg-[var(--neo-secondary)] xl:flex"
          >
            <Search className="size-4 shrink-0" />
            <input
              name="query"
              placeholder="搜索角色 / 标题 / 标签"
              className="min-w-0 flex-1 bg-transparent text-xs font-black text-current placeholder:text-current/55 outline-none"
            />
          </form>

          <details className="group relative hidden md:block">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 border-2 border-black bg-[var(--neo-muted)] px-3 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:bg-[var(--neo-secondary)] [&::-webkit-details-marker]:hidden">
              <Sparkles className="size-3.5" />
              游戏切换
              <ChevronDown className="size-3.5 transition group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+10px)] grid w-56 gap-2 border-4 border-black bg-white p-3 text-black shadow-[8px_8px_0px_0px_#000]">
              {games.map((gameItem, index) => (
                <Link
                  key={gameItem.key}
                  href={getSwitchHref(gameItem)}
                  aria-current={gameItem.key === game.key ? "page" : undefined}
                  className={`flex items-center justify-between border-2 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 ${gameItem.key === game.key ? "bg-black text-white shadow-[5px_5px_0px_0px_var(--neo-accent)]" : index % 3 === 0 ? "bg-[var(--neo-accent)] text-black" : index % 3 === 1 ? "bg-[var(--neo-secondary)] text-black" : "bg-[var(--neo-muted)] text-black"}`}
                >
                  <span>{gameItem.name}</span>
                  <span
                    className={`text-[10px] tracking-[0.16em] ${gameItem.key === game.key ? "text-white/70" : "text-black/60"}`}
                  >
                    {gameItem.shortName}
                  </span>
                </Link>
              ))}
            </div>
          </details>

          <LayoutStyleToggle variant="glass" />

          <Link
            href="/zenless-zone-zero/favorites"
            className="hidden h-9 items-center gap-1.5 border-2 border-black bg-white px-3 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:bg-white sm:inline-flex"
          >
            <Heart className="size-3.5" />
            收藏
          </Link>

          <Suspense fallback={<ZenlessNavAuthSkeleton />}>
            <ZenlessNavAuthAction game={game} />
          </Suspense>

          <Link
            href={game.nav.mods}
            className="hidden h-9 items-center gap-1.5 border-2 border-black bg-[var(--neo-accent)] px-3 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] xl:inline-flex"
          >
            <Sparkles className="size-3.5" />
            直链下载
          </Link>
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[1680px] items-center gap-1.5 overflow-x-auto px-2 pb-2 sm:px-3 lg:hidden">
        {zenlessNavItems.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] ${index % 2 === 0 ? "bg-[var(--neo-secondary)]" : "bg-white"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
