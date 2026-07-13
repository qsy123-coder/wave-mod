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
    <main className="relative -mt-[74px] flex h-[calc(100vh-74px)] items-center justify-center bg-[var(--neo-panel)] pt-[74px] text-black zzz-profile-bg overflow-hidden">
      <div className="relative z-10 text-center">
        <div className={`${panel} mx-auto max-w-md space-y-4 p-8`}>
          <UserRound className="mx-auto size-12 text-black" />
          <h2 className="text-xl font-black text-black">个人中心</h2>
          <p className="text-sm font-bold leading-relaxed text-black">
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
