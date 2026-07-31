import Image from "next/image";
import { Crown, Medal, ShieldCheck, Sparkles, Trophy } from "lucide-react";

import type { CreatorProfile } from "@/lib/mods";
import { isExternalStorageUrl } from "@/lib/storage/shared";

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
    <aside className="flex flex-col min-h-0 overflow-hidden space-y-2">
      {/* About Me */}
      <section className={`${panel} shrink-0 p-2.5`}>
        <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-black">
          About Me
        </h3>
        {profile.bio ? (
          <p className="mt-1.5 text-xs font-bold leading-5 text-black line-clamp-3">
            {profile.bio}
          </p>
        ) : (
          <p className="mt-1.5 text-xs font-bold leading-5 text-black">
            还没有写简介…
          </p>
        )}
        <p className="mt-1.5 text-[10px] font-bold text-black">
          已发布 {profile.stats.modCount} 个 MOD ·{" "}
          {compact(profile.stats.totalDownloads)} 次下载
        </p>
        <div className="mt-2 flex gap-2 text-black">
          <ShieldCheck className="size-3.5" />
          <Sparkles className="size-3.5" />
          <Crown className="size-3.5" />
          <Trophy className="size-3.5" />
        </div>
      </section>

      {/* Creator Badges */}
      <section className={`${panel} shrink-0 p-2.5`}>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-black">
            Creator Badges
          </h3>
          <span className="text-[9px] font-black text-black">View all</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[Medal, ShieldCheck, Crown, Trophy].map((Icon, index) => (
            <div
              key={index}
              className="flex aspect-square items-center justify-center border-2 border-black bg-black/5 shadow-[2px_2px_0_0_#000]"
            >
              <Icon className="size-4 text-black" />
            </div>
          ))}
        </div>
      </section>

      {/* Top Supporters */}
      <section className={`${panel} flex flex-col flex-1 min-h-0 overflow-hidden p-2.5`}>
        <h3 className="shrink-0 text-[11px] font-black uppercase tracking-[0.16em] text-black">
          Top Supporters
        </h3>
        <div className="flex-1 min-h-0 overflow-hidden mt-1.5 space-y-1.5">
          {supporters.map((name, index) => {
            const supporterMod =
              profile.mods[index % Math.max(1, profile.mods.length)];
            return (
              <div
                key={name}
                className="flex items-center justify-between text-[11px] font-bold text-black"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="relative size-5 overflow-hidden rounded-full border border-black bg-black">
                    {supporterMod ? (
                      <Image
                        src={supporterMod.coverImage}
                        alt={name}
                        fill
                        sizes="20px"
                        className="object-cover"
                        unoptimized={isExternalStorageUrl(supporterMod.coverImage ?? "")}
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-[8px] font-black text-black">
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
          {/* 占位支持者 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`ph-sp-${i}`} className="flex items-center justify-between text-[11px] font-bold text-black/20 opacity-20">
              <span className="inline-flex items-center gap-2">
                <span className="size-5 rounded-full border border-black/20 bg-black/20" />
                <span>---</span>
              </span>
              <span>---</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
