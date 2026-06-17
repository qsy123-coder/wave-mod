import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { getCreatorProfile } from "@/lib/mods";

import { compact } from "../../profile/profile-shared";
import type { StatItem } from "../../profile/profile-shared";
import { ProfileCreatorNotFound } from "../../profile/profile-creator-not-found";
import { ProfileContent } from "../../profile/profile-content";

type PageProps = {
  params: Promise<{ game: string; id: string }>;
};

export default async function CreatorDetailPage({ params }: PageProps) {
  const { game: gameSlug, id: userId } = await params;
  const game = getGameBySlug(gameSlug);
  if (!game) notFound();

  const profile = await getCreatorProfile(userId, game.key);

  if (!profile) {
    return <ProfileCreatorNotFound gameHomeHref={game.nav.home} />;
  }

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
      isOwnProfile={false}
      stats={stats}
    />
  );
}
