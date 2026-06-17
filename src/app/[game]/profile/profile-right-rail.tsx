import Image from "next/image";
import { Crown, Medal, ShieldCheck, Sparkles, Trophy } from "lucide-react";

import type { CreatorProfile } from "@/lib/mods";

import { compact, panel } from "./profile-shared";

export function ProfileRightRail({
  profile,
}: {
  profile: CreatorProfile;
}) {
  const supporters = [
    "StellarDream",
    "Lunaris",
    "FrostByte",
    "Arkanist",
    "Nightfall",
  ];

  return (
    <aside className="space-y-4">
      {/* About Me */}
      <section className={`${panel} p-4`}>
        <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
          About Me
        </h3>
        {profile.bio ? (
          <p className="mt-3 text-xs font-bold leading-5 text-slate-300">
            {profile.bio}
          </p>
        ) : (
          <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
            还没有写简介…
          </p>
        )}
        <p className="mt-2 text-[10px] font-bold text-slate-500">
          已发布 {profile.stats.modCount} 个 MOD ·{" "}
          {compact(profile.stats.totalDownloads)} 次下载
        </p>
        <div className="mt-4 flex gap-2 text-slate-300">
          <ShieldCheck className="size-4" />
          <Sparkles className="size-4" />
          <Crown className="size-4" />
          <Trophy className="size-4" />
        </div>
      </section>

      {/* Creator Badges */}
      <section className={`${panel} p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
            Creator Badges
          </h3>
          <span className="text-[9px] font-black text-slate-500">View all</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[Medal, ShieldCheck, Crown, Trophy].map((Icon, index) => (
            <div
              key={index}
              className="flex aspect-square items-center justify-center border-2 border-black bg-[#0b1220]/70 shadow-[2px_2px_0_0_#000]"
            >
              <Icon className="size-5 text-slate-200" />
            </div>
          ))}
        </div>
      </section>

      {/* Top Supporters */}
      <section className={`${panel} p-4`}>
        <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
          Top Supporters
        </h3>
        <div className="mt-3 space-y-2">
          {supporters.map((name, index) => {
            const supporterMod =
              profile.mods[index % Math.max(1, profile.mods.length)];
            return (
              <div
                key={name}
                className="flex items-center justify-between text-[11px] font-bold text-slate-400"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="relative size-5 overflow-hidden rounded-full border border-black bg-[#111827]">
                    {supporterMod ? (
                      <Image
                        src={supporterMod.coverImage}
                        alt={name}
                        fill
                        sizes="20px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-[8px] font-black text-slate-600">
                        ?
                      </span>
                    )}
                  </span>
                  {name}
                </span>
                <span>
                  {compact(profile.stats.totalLikes / (index + 2))}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
