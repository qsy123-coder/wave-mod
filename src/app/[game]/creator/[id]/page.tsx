import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { getCreatorProfile } from "@/lib/mods";

import { compact } from "../../profile/profile-shared";
import type { StatItem } from "../../profile/profile-shared";
import { ProfileCreatorNotFound } from "../../profile/profile-creator-not-found";
import { ProfileContent } from "../../profile/profile-content";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";

type PageProps = {
  params: Promise<{ game: string; id: string }>;
};

async function CreatorData({ params }: PageProps) {
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

export default function CreatorDetailPage(props: PageProps) {
  return (
    <Suspense fallback={<ModGridSkeleton />}>
      <CreatorData {...props} />
    </Suspense>
  );
}
