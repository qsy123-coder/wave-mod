import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";

import { panel } from "./profile-shared";

/** 创作者未找到（明确指定了 ?user= 但查不到） */
export function ProfileCreatorNotFound({
  gameHomeHref,
}: {
  gameHomeHref: string;
}) {
  return (
    <main className="relative -mt-[74px] flex h-[calc(100vh-74px)] items-center justify-center bg-[var(--neo-panel)] pt-[74px] text-black zzz-profile-bg overflow-hidden">
      <div className="relative z-10 text-center">
        <div className={`${panel} mx-auto max-w-md space-y-4 p-8`}>
          <UserRound className="mx-auto size-12 text-black" />
          <h2 className="text-xl font-black text-black">创作者未找到</h2>
          <p className="text-sm font-bold leading-relaxed text-black">
            该创作者不存在或尚未发布任何 MOD。
          </p>
          <Link
            href={gameHomeHref}
            className="inline-block border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
          >
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
