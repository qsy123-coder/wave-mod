import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { getCreatorProfileUncached } from "@/lib/mods";
import { ensureProfile, getCurrentUser } from "@/lib/supabase/server";

import { panel } from "../profile-shared";
import { ProfileEditForm } from "../profile-edit-form";

type PageProps = {
  params: Promise<{ game: string }>;
};

export default async function ProfileEditPage({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);
  if (!game) notFound();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(
      `/auth/login?mode=user&next=${encodeURIComponent(`${game.nav.home}/profile/edit`)}`,
    );
  }

  // 确保 profile 存在
  await ensureProfile();

  const profile = await getCreatorProfileUncached(currentUser.id, game.key);

  if (!profile) {
    return (
      <main className="relative -mt-[74px] flex min-h-screen items-center justify-center overflow-hidden bg-[#04070d] pt-[86px] text-white">
        <div className={`${panel} p-8 text-center`}>
          <p className="text-sm font-bold text-slate-400">
            个人资料加载失败，请稍后再试。
          </p>
        </div>
      </main>
    );
  }

  const profileHref = game.nav.profile ?? `${game.nav.home}/profile`;

  return (
    <main className="relative -mt-[74px] min-h-screen overflow-hidden bg-[#04070d] pt-[86px] text-white">
      <div className="absolute inset-0">
        <Image
          src="/bg-zzz/zzz-detail-bg.png"
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_0%,rgba(118,141,255,0.2),transparent_32%),linear-gradient(90deg,rgba(4,7,13,0.96),rgba(4,7,13,0.62)_45%,rgba(4,7,13,0.92))]" />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-[1500px] gap-5 px-5 pb-8 lg:px-8">
        <div className="mx-auto w-full max-w-lg space-y-4 pt-20">
          <section className={`${panel} p-6`}>
            <h2 className="mb-6 text-lg font-black text-white">编辑个人资料</h2>
            <ProfileEditForm profile={profile} gameProfileHref={profileHref} />
          </section>
        </div>
      </div>
    </main>
  );
}
