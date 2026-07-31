import Image from "next/image";
import Link from "next/link";
import { Download, Heart, Star } from "lucide-react";

import type { CreatorProfile } from "@/lib/mods";
import { isExternalStorageUrl } from "@/lib/storage/shared";

import { compact } from "./profile-shared";

export function ProfileModMiniCard({
  href,
  mod,
  tone,
  large = false,
}: {
  href: string;
  mod: CreatorProfile["mods"][number];
  tone: string;
  large?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col shrink-0 overflow-hidden border-2 border-black bg-white shadow-[4px_4px_0_0_#000] transition hover:-translate-y-1 ${
        large ? "w-[260px] sm:w-[300px]" : "w-[200px] sm:w-[220px]"
      }`}
    >
      <div className="relative bg-black flex-1 min-h-[112px]">
        <Image
          src={mod.coverImage}
          alt={mod.title}
          fill
          sizes={large ? "600px" : "280px"}
          className="object-cover transition duration-300 group-hover:scale-105"
          unoptimized={isExternalStorageUrl(mod.coverImage ?? "")}
        />
        <span
          className={`absolute left-1.5 top-1.5 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${tone}`}
        >
          {mod.nsfw ? "NSFW" : "Hot"}
        </span>
        <span className="absolute right-1.5 top-1.5 border border-black bg-black/10 px-1.5 py-0.5 text-[8px] font-black text-black">
          {mod.version}
        </span>
      </div>
      <div className="p-2">
        <p className={`line-clamp-1 font-black text-black ${large ? "text-sm" : "text-xs"}`}>
          {mod.title}
        </p>
        <p className={`mt-0.5 line-clamp-1 font-bold text-black ${large ? "text-[11px]" : "text-[10px]"}`}>
          {mod.character}
        </p>
        <div className={`mt-1.5 flex items-center gap-3 font-black text-black ${large ? "text-[10px]" : "text-[9px]"}`}>
          <span className="inline-flex items-center gap-1">
            <Download className="size-3" />
            {compact(mod.downloads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" />
            {compact(mod.favorites)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-slate-300 text-black" />
            {mod.ratingAverage.toFixed(1)}
          </span>
        </div>
      </div>
    </Link>
  );
}
