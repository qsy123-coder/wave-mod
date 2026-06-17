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
          <h2 className="text-xl font-black text-white">创作者未找到</h2>
          <p className="text-sm font-bold leading-relaxed text-slate-400">
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
