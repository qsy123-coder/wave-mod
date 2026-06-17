import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";

import type { GameConfig } from "@/config/games";
import type { User } from "@supabase/supabase-js";

import { panel } from "./profile-shared";
import type { StatItem } from "./profile-shared";
import { ProfileSideNav } from "./profile-side-nav";

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
    <main className="relative -mt-[74px] min-h-screen overflow-hidden bg-[#04070d] pt-[86px] text-white">
      <div className="absolute inset-0">
        <Image
          src="/bg-zzz/zzz-detail-bg.png"
          alt="profile background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_0%,rgba(118,141,255,0.2),transparent_32%),linear-gradient(90deg,rgba(4,7,13,0.96),rgba(4,7,13,0.62)_45%,rgba(4,7,13,0.92))]" />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-[1500px] gap-5 px-5 pb-8 lg:px-8">
        <ProfileSideNav
            profileHref={game.nav.profile ?? `${game.nav.home}/profile`}
            favoritesHref={`${game.nav.home}/favorites`}
            editProfileHref={`${game.nav.profile ?? `${game.nav.home}/profile`}/edit`}
          />
        <div className="min-w-0 flex-1">
          {/* 封面 + 头像 + 名字 */}
          <section
            className={`${panel} relative min-h-[260px] overflow-hidden`}
          >
            <Image
              src="/bg-zzz/zzz-detail-bg.png"
              alt="cover"
              fill
              sizes="1200px"
              className="object-cover object-[center_28%] opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#04070d] via-[#04070d]/30 to-transparent" />
            <div className="relative flex min-h-[260px] items-end justify-between gap-4 p-5">
              <div className="flex flex-wrap items-end gap-5">
                <div className="relative size-28 overflow-hidden rounded-full border-4 border-black bg-[#111827] shadow-[5px_5px_0_0_#000]">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={fallbackName}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-4xl font-black text-slate-400">
                      {String(fallbackName).charAt(0)}
                    </span>
                  )}
                </div>
                <div className="pb-1">
                  <h1 className="text-3xl font-black text-white [text-shadow:3px_3px_0_#000]">
                    {fallbackName}
                  </h1>
                  <p className="mt-1 text-sm font-bold text-slate-300">
                    还没有发布 MOD
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="border-2 border-black bg-[#07111f]/80 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">
                      Player
                    </span>
                    <span className="border-2 border-black bg-[#07111f]/80 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">
                      {game.name}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 统计栏 */}
          <section
            className={`${panel} mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5`}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-r border-white/10 last:border-r-0"
              >
                <p className="text-2xl font-black text-white">{stat.value}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </section>

          {/* 引导成为创作者 */}
          <div className="mt-4">
            <section className={`${panel} p-8 text-center`}>
              <Sparkles className="mx-auto size-10 text-slate-500" />
              <h3 className="mt-4 text-lg font-black text-white">
                成为创作者
              </h3>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-400">
                上传你的第一个 MOD，即可解锁创作者主页。
                <br />
                你的作品将出现在排行榜中，获得社区曝光和下载。
              </p>
              <Link
                href="/admin/upload"
                className="mt-4 inline-block border-2 border-black bg-[var(--neo-accent)] px-5 py-2.5 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
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
