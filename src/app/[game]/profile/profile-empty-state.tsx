import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";

import { panel } from "./profile-shared";

/** 空状态：未指定用户且未登录 → 引导登录或浏览 MOD */
export function ProfileEmptyState({
  gameHomeHref,
}: {
  gameHomeHref: string;
}) {
  return (
    <main className="relative -mt-[74px] flex min-h-screen items-center justify-center overflow-hidden bg-[#04070d] pt-[86px] text-white">
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
      <div className="relative z-10 text-center">
        <div className={`${panel} mx-auto max-w-md space-y-4 p-8`}>
          <UserRound className="mx-auto size-12 text-slate-500" />
          <h2 className="text-xl font-black text-white">个人中心</h2>
          <p className="text-sm font-bold leading-relaxed text-slate-400">
            登录后可查看您的个人中心，或通过创作者排名点击查看其他创作者的作品。
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href={`/auth/login?mode=user&next=${encodeURIComponent(gameHomeHref)}`}
              className="border-2 border-black bg-[var(--neo-accent)] px-4 py-2 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
            >
              立即登录
            </Link>
            <Link
              href={gameHomeHref}
              className="border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
            >
              浏览 MOD
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
