import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { CreatorProfile, FavoriteMod } from "@/lib/mods";

import { compact, panel } from "./profile-shared";
import type { StatItem } from "./profile-shared";
import { ProfileSideNav } from "./profile-side-nav";
import { ProfileModMiniCard } from "./profile-mod-mini-card";
import { ProfileRightRail } from "./profile-right-rail";
import { ProfileEditButton } from "./profile-edit-form";

type ProfileContentProps = {
  profile: CreatorProfile;
  game: GameConfig;
  isOwnProfile: boolean;
  stats: StatItem[];
  activeTab?: "published" | "favorites";
  favoriteMods?: FavoriteMod[] | null;
};

export function ProfileContent({
  profile,
  game,
  isOwnProfile,
  stats,
  activeTab = "published",
  favoriteMods,
}: ProfileContentProps) {
  const coverImage =
    profile.mods[0]?.coverImage ?? "/bg-zzz/zzz-detail-bg.png";
  const published = profile.mods.slice(0, 4);

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
      <div className="relative z-10 mx-auto w-full max-w-[1500px] space-y-3 px-5 pb-8 lg:px-8">
        {/* 面包屑导航 */}
        <nav className="flex items-center gap-1.5 pt-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
          <Link href={game.nav.home} className="hover:text-white transition">
            首页
          </Link>
          <ChevronRight className="size-3" />
          {isOwnProfile ? (
            <span className="text-white">个人中心</span>
          ) : (
            <>
              <Link
                href={game.nav.ranking ?? `${game.nav.home}/ranking`}
                className="hover:text-white transition"
              >
                排行榜
              </Link>
              <ChevronRight className="size-3" />
              <span className="text-white truncate max-w-[200px]">
                {profile.displayName}
              </span>
            </>
          )}
        </nav>

        <div className="flex gap-5">
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
              src={coverImage}
              alt={`${profile.displayName} cover`}
              fill
              sizes="1200px"
              className="object-cover object-[center_28%] opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#04070d] via-[#04070d]/30 to-transparent" />
            <div className="relative flex min-h-[260px] items-end justify-between gap-4 p-5">
              <div className="flex flex-wrap items-end gap-5">
                {/* 头像：优先真实 avatar_url，兜底首字圆形 */}
                <div className="relative size-28 overflow-hidden rounded-full border-4 border-black bg-[#111827] shadow-[5px_5px_0_0_#000]">
                  {profile.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-4xl font-black text-slate-400">
                      {profile.displayName.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="pb-1">
                  <h1 className="text-3xl font-black text-white [text-shadow:3px_3px_0_#000]">
                    {profile.displayName}
                  </h1>
                  <p className="mt-1 text-sm font-bold text-slate-300">
                    {profile.stats.modCount > 0
                      ? `已创作 ${profile.stats.modCount} 个 MOD`
                      : "还没有发布 MOD"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="border-2 border-black bg-[#1f2a44]/80 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                      {profile.stats.modCount > 0 ? "Creator" : "Player"}
                    </span>
                    {profile.stats.totalDownloads >= 1000 && (
                      <span className="border-2 border-black bg-[#21315f]/80 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                        Top Creator
                      </span>
                    )}
                    <span className="border-2 border-black bg-[#07111f]/80 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">
                      {game.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* 编辑按钮：仅自己可见 */}
              {isOwnProfile && (
                <ProfileEditButton
                  editHref={`${game.nav.profile ?? `${game.nav.home}/profile`}/edit`}
                />
              )}
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

          {/* MOD 列表 + 右侧 Rail */}
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {/* MOD 列表（已发布 / 收藏） */}
              <section className={`${panel} p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-6 text-[11px] font-black uppercase tracking-[0.14em]">
                    {isOwnProfile ? (
                      <>
                        <Link
                          href="?tab=published"
                          className={
                            activeTab === "published"
                              ? "text-white underline underline-offset-4"
                              : "text-slate-500 hover:text-slate-300"
                          }
                        >
                          Published Mods
                        </Link>
                        <Link
                          href="?tab=favorites"
                          className={
                            activeTab === "favorites"
                              ? "text-white underline underline-offset-4"
                              : "text-slate-500 hover:text-slate-300"
                          }
                        >
                          My Favorites
                        </Link>
                      </>
                    ) : (
                      <>
                        <span className="text-white">Published Mods</span>
                        <span className="text-slate-500">Collections</span>
                        <span className="text-slate-500">Liked Mods</span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 text-[10px] font-bold text-slate-400">
                    <span className="border border-white/10 bg-black/20 px-3 py-1">
                      {activeTab === "favorites" ? "Favorites" : "All Categories"}
                    </span>
                    <span className="border border-white/10 bg-black/20 px-3 py-1">
                      Newest
                    </span>
                  </div>
                </div>

                {activeTab === "favorites" ? (
                  /* 收藏列表 */
                  favoriteMods && favoriteMods.length > 0 ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      {favoriteMods.slice(0, 4).map((mod, index) => (
                        <ProfileModMiniCard
                          key={mod.id}
                          href={`${game.nav.mods}/${mod.id}`}
                          mod={mod}
                          tone={
                            index === 0
                              ? "bg-[#611b25] text-white"
                              : index === 1
                                ? "bg-[#123d2a] text-[#b4ffcb]"
                                : "bg-[#1d2c4a] text-[#c7d8ff]"
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 py-8 text-center">
                      <p className="text-sm font-bold text-slate-400">
                        还没有收藏任何 MOD
                      </p>
                      <Link
                        href={game.nav.mods}
                        className="mt-3 inline-block text-xs font-black text-[var(--neo-accent)] hover:underline"
                      >
                        去 MOD 列表逛逛 →
                      </Link>
                    </div>
                  )
                ) : (
                  /* 已发布 MOD */
                  published.length > 0 ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      {published.map((mod, index) => (
                        <ProfileModMiniCard
                          key={mod.id}
                          href={`${game.nav.mods}/${mod.id}`}
                          mod={mod}
                          tone={
                            index === 0
                              ? "bg-[#611b25] text-white"
                              : index === 1
                                ? "bg-[#123d2a] text-[#b4ffcb]"
                                : "bg-[#1d2c4a] text-[#c7d8ff]"
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 py-8 text-center text-sm font-bold text-slate-500">
                      暂无已发布的 MOD
                    </p>
                  )
                )}
              </section>

              {/* 近期动态 */}
              {profile.mods.length > 0 && (
                <section className={`${panel} p-4`}>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                    Recent Activity
                  </h3>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    {profile.mods.slice(0, 3).map((mod, index) => (
                      <div
                        key={mod.id}
                        className="flex gap-3 border border-white/10 bg-[#050914]/35 p-2"
                      >
                        <div className="relative size-12 shrink-0 overflow-hidden border-2 border-black bg-black">
                          <Image
                            src={mod.coverImage}
                            alt={mod.title}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        </div>
                        <div>
                          <p className="line-clamp-2 text-[11px] font-black text-white">
                            {index === 0
                              ? "发布了"
                              : index === 1
                                ? "更新了"
                                : "优化了"}
                            {" · "}
                            {mod.title}
                          </p>
                          <p className="mt-1 text-[10px] font-bold text-slate-500">
                            {mod.createdAt
                              ? new Date(mod.createdAt).toLocaleDateString(
                                  "zh-CN",
                                )
                              : "最近"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <ProfileRightRail profile={profile} />
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
