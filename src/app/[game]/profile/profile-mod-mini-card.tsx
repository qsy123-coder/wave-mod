import Image from "next/image";
import Link from "next/link";
import { Download, Heart, Star } from "lucide-react";

import type { CreatorProfile } from "@/lib/mods";

import { compact } from "./profile-shared";

export function ProfileModMiniCard({
  href,
  mod,
  tone,
}: {
  href: string;
  mod: CreatorProfile["mods"][number];
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden border-2 border-black bg-[#08111f]/70 shadow-[4px_4px_0_0_#000] transition hover:-translate-y-1"
    >
      <div className="relative h-36 bg-black">
        <Image
          src={mod.coverImage}
          alt={mod.title}
          fill
          sizes="280px"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        <span
          className={`absolute left-2 top-2 border border-black px-1.5 py-0.5 text-[9px] font-black uppercase ${tone}`}
        >
          {mod.nsfw ? "NSFW" : mod.tags[0] ?? "Hot"}
        </span>
        <span className="absolute right-2 top-2 border border-black bg-[#07111f]/80 px-1.5 py-0.5 text-[9px] font-black text-white">
          {mod.version}
        </span>
      </div>
      <div className="p-3">
        <p className="line-clamp-1 text-sm font-black text-white">
          {mod.title}
        </p>
        <p className="mt-1 line-clamp-1 text-[11px] font-bold text-slate-500">
          {mod.character}
        </p>
        <div className="mt-3 flex items-center gap-4 text-[10px] font-black text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Download className="size-3" />
            {compact(mod.downloads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" />
            {compact(mod.favorites)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-slate-300 text-slate-300" />
            {mod.ratingAverage.toFixed(1)}
          </span>
        </div>
      </div>
    </Link>
  );
}
