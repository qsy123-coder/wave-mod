import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

import { getGameBySlug } from "@/config/games";
import { logger } from "@/lib/logger";
import { getCreatorProfile, getCreatorProfileUncached, getFavoriteMods } from "@/lib/mods";
import { ensureProfile, getCurrentUser } from "@/lib/supabase/server";

import { compact } from "./profile-shared";
import type { StatItem } from "./profile-shared";
import { ProfileEmptyState } from "./profile-empty-state";
import { ProfileBasicCenter } from "./profile-basic-center";
import { ProfileCreatorNotFound } from "./profile-creator-not-found";
import { ProfileContent } from "./profile-content";

type PageProps = {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ user?: string; tab?: string }>;
};

export default async function GameProfilePage({
  params,
  searchParams,
}: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);
  if (!game) notFound();

  const { user: queryUser, tab } = await searchParams;
  const currentUser = await getCurrentUser();

  const targetUserId = queryUser ?? currentUser?.id ?? null;
  const isOwnProfile =
    !queryUser || (currentUser ? queryUser === currentUser.id : false);
  const activeTab = tab === "favorites" && isOwnProfile ? "favorites" : "published";

  if (!targetUserId) {
    return <ProfileEmptyState gameHomeHref={game.nav.home} />;
  }

  if (isOwnProfile && currentUser) {
    try {
      await ensureProfile();
    } catch (e) {
      logger.warn("[profile] ensureProfile failed", {
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  const profile = isOwnProfile
    ? await getCreatorProfileUncached(targetUserId, game.key)
    : await getCreatorProfile(targetUserId, game.key);

  if (!profile) {
    if (isOwnProfile && currentUser) {
      return <ProfileBasicCenter currentUser={currentUser} game={game} />;
    }
    return <ProfileCreatorNotFound gameHomeHref={game.nav.home} />;
  }

  // 收藏标签：仅自己的个人中心可用
  const favoriteMods =
    activeTab === "favorites" && isOwnProfile
      ? ((await getFavoriteMods()) ?? []).filter((m) => m.gameKey === game.key)
      : null;

  const stats: StatItem[] = [
    { label: "Mods Published", value: String(profile.stats.modCount) },
    { label: "Total Downloads", value: compact(profile.stats.totalDownloads) },
    { label: "Favorites Received", value: compact(profile.stats.totalFavorites) },
    { label: "Following", value: "—" },
    { label: "Likes Received", value: compact(profile.stats.totalLikes) },
  ];

  return (
    <ProfileContent
      profile={profile}
      game={game}
      isOwnProfile={isOwnProfile}
      stats={stats}
      activeTab={activeTab}
      favoriteMods={favoriteMods}
    />
  );
}
