import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";

import type { GameConfig } from "@/config/games";
import type { User } from "@supabase/supabase-js";

import { panel } from "./profile-shared";
import type { StatItem } from "./profile-shared";
import { ProfileSideNav } from "./profile-side-nav";
import { CoverReveal } from "./cover-reveal";

/**
 * 基础个人中心：已登录但 profiles 表中尚无记录（或未发布过 MOD 的普通用户）。
 * 展示基于 auth 用户的降级信息，避免空白页。
 */
export function ProfileBasicCenter({
  currentUser,
  game,
}: {
  currentUser: User;
  game: GameConfig;
}) {
  const email = currentUser.email ?? "";
  const fallbackName =
    currentUser.user_metadata?.display_name ??
    currentUser.user_metadata?.full_name ??
    (email ? email.split("@")[0] : "玩家");
  const avatarUrl = currentUser.user_metadata?.avatar_url ?? null;

  if (!game) notFound();

  const stats: StatItem[] = [
    { label: "Mods Published", value: "0" },
    { label: "Total Downloads", value: "—" },
    { label: "Followers", value: "—" },
    { label: "Following", value: "—" },
    { label: "Likes Received", value: "—" },
  ];

  return (
    <main className="relative -mt-[74px] h-[calc(100vh-74px)] flex flex-col overflow-hidden bg-[var(--neo-panel)] pt-[74px] text-black zzz-profile-bg">
      <div className="relative z-10 flex flex-1 min-h-0 mx-auto w-full max-w-[1500px] gap-3 px-5 pb-4 lg:px-8">
        <ProfileSideNav
          profileHref={game.nav.profile ?? `${game.nav.home}/profile`}
          favoritesHref={`${game.nav.home}/favorites`}
          editProfileHref={`${game.nav.profile ?? `${game.nav.home}/profile`}/edit`}
        />
        <div className="min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 封面 + 头像 + 名字 — 鼠标滑过 InkReveal 擦除遮罩 */}
          <CoverReveal
            coverImage="/bg-zzz/ChatGPT Image 2026年6月2日 00_01_21.png"
            coverAlt="cover"
            height="h-[190px] sm:h-[220px]"
          >
            <div className="flex flex-wrap items-end gap-2 sm:gap-3">
              <div className="relative size-20 sm:size-24 rounded-full border-4 border-black bg-black shadow-[5px_5px_0_0_#000]">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={fallbackName}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-4xl font-black text-black">
                    {String(fallbackName).charAt(0)}
                  </span>
                )}
              </div>
              <div className="pb-0.5">
                <h1 className="text-xl sm:text-2xl font-black text-black ">
                  {fallbackName}
                </h1>
                <p className="mt-0.5 sm:mt-1 text-sm sm:text-base font-bold text-black">
                  还没有发布 MOD
                </p>
                <div className="mt-1 sm:mt-1.5 flex flex-wrap gap-1.5 sm:gap-2">
                  <span className="border-2 border-black bg-black/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-black uppercase text-black">
                    Player
                  </span>
                  <span className="border-2 border-black bg-black/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-black uppercase text-black">
                    {game.name}
                  </span>
                </div>
              </div>
            </div>
          </CoverReveal>

          {/* 统计栏 */}
          <section className="shrink-0 mt-1.5 grid gap-3 border-4 border-black bg-white/30 p-2 sm:p-2.5 text-black shadow-[5px_5px_0px_0px_#000] sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-r border-black/10 last:border-r-0 px-1"
              >
                <p className="text-lg sm:text-xl font-black text-black">
                  {stat.value}
                </p>
                <p className="mt-0.5 sm:mt-1 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] text-black">
                  {stat.label}
                </p>
              </div>
            ))}
          </section>

          {/* 引导成为创作者 */}
          <div className="mt-1.5 flex-1 min-h-0 overflow-hidden flex items-center justify-center">
            <section className="border-4 border-black bg-white/30 p-4 text-center shadow-[5px_5px_0px_0px_#000] max-w-md">
              <Sparkles className="mx-auto size-10 text-black" />
              <h3 className="mt-1 text-base font-black text-black">
                成为创作者
              </h3>
              <p className="mt-1 text-sm font-bold leading-relaxed text-black">
                上传你的第一个 MOD，即可解锁创作者主页。
                <br />
                你的作品将出现在排行榜中，获得社区曝光和下载。
              </p>
              <Link
                href="/admin/upload"
                className="mt-1 inline-block border-2 border-black bg-white/30 px-5 py-2.5 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
              >
                上传 MOD
              </Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
