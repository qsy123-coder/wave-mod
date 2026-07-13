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
import { ScrollableRow } from "./scrollable-row";
import { CoverReveal } from "./cover-reveal";

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
    profile.mods[0]?.coverImage ??
    "/bg-zzz/ChatGPT Image 2026年6月2日 00_01_21.png";
  const published = profile.mods.slice(0, 4);

  return (
    <main className="relative -mt-[74px] h-[calc(100vh-44px)] flex flex-col overflow-hidden bg-[var(--neo-panel)] pt-[74px] text-black zzz-profile-bg">
      <div className="relative z-10 flex flex-col flex-1 min-h-0 mx-auto w-full max-w-[1500px] px-5 pb-4 lg:px-8">
        {/* 面包屑导航 */}
        <nav className="shrink-0 flex items-center gap-1.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-black">
          <Link href={game.nav.home} className="hover:text-black transition">
            首页
          </Link>
          <ChevronRight className="size-3" />
          {isOwnProfile ? (
            <span className="text-black">个人中心</span>
          ) : (
            <>
              <Link
                href={game.nav.ranking ?? `${game.nav.home}/ranking`}
                className="hover:text-black transition"
              >
                排行榜
              </Link>
              <ChevronRight className="size-3" />
              <span className="text-black truncate max-w-[200px]">
                {profile.displayName}
              </span>
            </>
          )}
        </nav>

        <div className="flex gap-1.5 flex-1 min-h-0">
          <ProfileSideNav
            profileHref={game.nav.profile ?? `${game.nav.home}/profile`}
            favoritesHref={`${game.nav.home}/favorites`}
            editProfileHref={`${game.nav.profile ?? `${game.nav.home}/profile`}/edit`}
          />

          <div className="min-w-0 flex-1 flex flex-col min-h-0">
            {/* 封面 + 头像 + 名字 — 鼠标滑过 InkReveal 擦除遮罩 */}
            <CoverReveal
              coverImage={coverImage}
              coverAlt={`${profile.displayName} cover`}
              height="h-[190px] sm:h-[220px]"
              actions={
                isOwnProfile ? (
                  <ProfileEditButton
                    editHref={`${game.nav.profile ?? `${game.nav.home}/profile`}/edit`}
                  />
                ) : null
              }
            >
              <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                {/* 头像：优先真实 avatar_url，兜底首字圆形 */}
                <div className="relative size-20 sm:size-24 overflow-hidden rounded-full border-4 border-black bg-black shadow-[5px_5px_0_0_#000]">
                  {profile.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-4xl font-black text-black">
                      {profile.displayName.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="pb-0.5">
                  <h1 className="text-xl sm:text-2xl font-black text-black ">
                    {profile.displayName}
                  </h1>
                  <p className="mt-0.5 sm:mt-1 text-sm sm:text-base font-bold text-black">
                    {profile.stats.modCount > 0
                      ? `已创作 ${profile.stats.modCount} 个 MOD`
                      : "还没有发布 MOD"}
                  </p>
                  <div className="mt-1 sm:mt-1.5 flex flex-wrap gap-1.5 sm:gap-2">
                    <span className="border-2 border-black bg-[var(--neo-secondary)]/80 px-2 py-0.5 text-[10px] sm:text-[11px] font-black uppercase text-black">
                      {profile.stats.modCount > 0 ? "Creator" : "Player"}
                    </span>
                    {profile.stats.totalDownloads >= 1000 && (
                      <span className="border-2 border-black bg-[var(--neo-secondary)] px-2 py-0.5 text-[10px] sm:text-[11px] font-black uppercase text-black">
                        Top Creator
                      </span>
                    )}
                    <span className="border-2 border-black bg-black/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-black uppercase text-black">
                      {game.name}
                    </span>
                  </div>
                </div>
              </div>

            </CoverReveal>

            {/* 统计栏 */}
            <section className="shrink-0 mt-2 grid gap-1.5 border-4 border-black bg-white/30 p-2 sm:p-2.5 text-black shadow-[5px_5px_0px_0px_#000] sm:grid-cols-2 lg:grid-cols-5">
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

            {/* MOD 列表 + 右侧 Rail */}
            <div className="mt-4 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_320px] flex-1 min-h-0">
              <div className="flex flex-col min-h-0 space-y-1 ">
                {/* MOD 列表（已发布 / 收藏） */}
                <section
                  className={`${panel} flex flex-col flex-1 min-h-0 p-2.5`}
                >
                  <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex gap-1.5 text-[11px] font-black uppercase tracking-[0.14em]">
                      {isOwnProfile ? (
                        <>
                          <Link
                            href="?tab=published"
                            className={
                              activeTab === "published"
                                ? "text-black underline underline-offset-4"
                                : "text-black hover:text-black"
                            }
                          >
                            Published Mods
                          </Link>
                          <Link
                            href="?tab=favorites"
                            className={
                              activeTab === "favorites"
                                ? "text-black underline underline-offset-4"
                                : "text-black hover:text-black"
                            }
                          >
                            My Favorites
                          </Link>
                        </>
                      ) : (
                        <>
                          <span className="text-black">Published Mods</span>
                          <span className="text-black">Collections</span>
                          <span className="text-black">Liked Mods</span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2 text-[10px] font-bold text-black">
                      <span className="border border-black/10 bg-black/5 px-3 py-1">
                        {activeTab === "favorites"
                          ? "Favorites"
                          : "All Categories"}
                      </span>
                      <span className="border border-black/10 bg-black/5 px-3 py-1">
                        Newest
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0">
                    {activeTab === "favorites" ? (
                      /* 收藏列表 */
                      favoriteMods && favoriteMods.length > 0 ? (
                        <ScrollableRow className="mt-1 h-full">
                          {favoriteMods.slice(0, 4).map((mod, index) => (
                            <ProfileModMiniCard
                              key={mod.id}
                              href={`${game.nav.mods}/${mod.id}`}
                              mod={mod}
                              large={index === 0}
                              tone={
                                index === 0
                                  ? "bg-[#611b25] text-black"
                                  : index === 1
                                    ? "bg-[#123d2a] text-[#b4ffcb]"
                                    : "bg-[#1d2c4a] text-[#c7d8ff]"
                              }
                            />
                          ))}
                          {/* 占位卡片 */}
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div
                              key={`ph-fav-${i}`}
                              className="flex flex-col shrink-0 w-[200px] sm:w-[220px] overflow-hidden border-2 border-black/20 bg-white/20 opacity-20 shadow-[4px_4px_0px_0px_#00000020]"
                            >
                              <div className="flex flex-col">
                                <div className="bg-black/20 flex-1 min-h-[112px]" />
                                <div className="p-2 space-y-1">
                                  <div className="h-3 bg-black/20" />
                                  <div className="h-2 w-2/3 bg-black/20" />
                                  <div className="flex gap-2">
                                    <div className="h-2 w-8 bg-black/20" />
                                    <div className="h-2 w-8 bg-black/20" />
                                    <div className="h-2 w-8 bg-black/20" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </ScrollableRow>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center py-8">
                            <p className="text-sm font-bold text-black">
                              还没有收藏任何 MOD
                            </p>
                            <Link
                              href={game.nav.mods}
                              className="mt-1.5 inline-block text-xs font-black text-[var(--neo-accent)] hover:underline"
                            >
                              去 MOD 列表逛逛 →
                            </Link>
                          </div>
                        </div>
                      )
                    ) : /* 已发布 MOD */
                    published.length > 0 ? (
                      <ScrollableRow className="mt-1 h-full">
                        {published.map((mod, index) => (
                          <ProfileModMiniCard
                            key={mod.id}
                            href={`${game.nav.mods}/${mod.id}`}
                            mod={mod}
                            large={index === 0}
                            tone={
                              index === 0
                                ? "bg-[#611b25] text-black"
                                : index === 1
                                  ? "bg-[#123d2a] text-[#b4ffcb]"
                                  : "bg-[#1d2c4a] text-[#c7d8ff]"
                            }
                          />
                        ))}
                        {/* 占位卡片 */}
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div
                            key={`ph-mod-${i}`}
                            className="flex flex-col shrink-0 w-[200px] sm:w-[220px] overflow-hidden border-2 border-black/20 bg-white/20 opacity-20 shadow-[4px_4px_0px_0px_#00000020]"
                          >
                            <div className="relative h-32 bg-black/20" />
                            <div className="p-2.5 space-y-1.5">
                              <div className="h-3.5 bg-black/20" />
                              <div className="h-2.5 w-2/3 bg-black/20" />
                              <div className="flex gap-3">
                                <div className="h-2.5 w-10 bg-black/20" />
                                <div className="h-2.5 w-10 bg-black/20" />
                                <div className="h-2.5 w-10 bg-black/20" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </ScrollableRow>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm font-bold text-black">
                          暂无已发布的 MOD
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* 近期动态 */}
                {profile.mods.length > 0 && (
                  <section className={`${panel} shrink-0 p-4.5`}>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-black">
                      Recent Activity
                    </h3>
                    <div className="mt-1.5 grid gap-1.5 lg:grid-cols-3">
                      {profile.mods.slice(0, 3).map((mod, index) => (
                        <div
                          key={mod.id}
                          className="flex gap-1.5 border border-black/10 bg-black/5 p-2"
                        >
                          <div className="relative size-12 shrink-0  border-2 border-black bg-black">
                            <Image
                              src={mod.coverImage}
                              alt={mod.title}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          </div>
                          <div>
                            <p className="line-clamp-2 text-[11px] font-black text-black">
                              {index === 0
                                ? "发布了"
                                : index === 1
                                  ? "更新了"
                                  : "优化了"}
                              {" · "}
                              {mod.title}
                            </p>
                            <p className="mt-1 text-[10px] font-bold text-black">
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
