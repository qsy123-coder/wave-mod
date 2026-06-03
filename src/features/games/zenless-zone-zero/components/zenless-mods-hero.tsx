import Image from "next/image";

import cityBackground from "../../../../../bg-zzz/长图粉色.png";
import { ZenlessModsMotionBackground } from "./zenless-mods-motion";

export function ZenlessModsBackground() {
  return (
    <ZenlessModsMotionBackground className="pointer-events-none absolute inset-x-0 top-0 h-[18vh] min-h-[260px] overflow-hidden">
      <Image
        src={cityBackground}
        alt="New Eridu skyline"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_28%,rgba(0,0,0,0.64)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/62 via-black/20 to-black/42" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#3a2418] via-[#3a2418]/70 to-transparent" />
    </ZenlessModsMotionBackground>
  );
}

export function ZenlessModsHeroCopy() {
  return (
    <div className="max-w-xl pb-2 pt-[88px] text-white drop-shadow-[4px_4px_0_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/70">
        Explore · Customize · Download
      </p>
      <h1 className="mt-1 text-4xl font-black uppercase leading-none sm:text-5xl lg:text-[3.25rem]">
        Popular Mods
      </h1>
      <p className="mt-3 max-w-lg text-xs font-bold leading-5 text-white/84">
        发现绝区零分站热门 MOD。高能角色外观、服装替换与直链下载都在这里。
      </p>
    </div>
  );
}
