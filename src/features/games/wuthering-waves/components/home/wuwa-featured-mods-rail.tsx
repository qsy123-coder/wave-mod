"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import type { SiteMod } from "@/lib/mods-domain/types";

const tagColors: Record<string, string> = {
  HOT: "bg-orange-500",
  TRENDING: "bg-purple-500",
  NEW: "bg-emerald-500",
  CHARACTER: "bg-blue-500",
  OUTFIT: "bg-pink-500",
  WEAPON: "bg-amber-500",
  ENVIRONMENT: "bg-teal-500",
};

const fallbackTags = ["HOT", "TRENDING", "NEW", "CHARACTER"];

function ModTag({ label }: { label: string }) {
  const upper = label.toUpperCase();
  const color = tagColors[upper] ?? "bg-slate-600";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${color}`}
    >
      {label}
    </span>
  );
}

function FeaturedModCard({ mod, index }: { mod: SiteMod; index: number }) {
  const tag = fallbackTags[index % fallbackTags.length];

  return (
    <Link
      href={`/mods/${mod.id}`}
      className="group relative block w-[220px] flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#161b22] transition hover:border-white/25"
    >
      <div className="relative h-[118px] w-full overflow-hidden">
        <Image
          src={mod.coverImage}
          alt=""
          fill
          sizes="224px"
          className="scale-110 object-cover blur-xl"
          aria-hidden="true"
          unoptimized={mod.coverImage?.includes("supabase.co")}
        />
        <Image
          src={mod.coverImage}
          alt={mod.title}
          fill
          sizes="224px"
          className="object-contain object-center transition-transform duration-500 group-hover:scale-105"
          unoptimized={mod.coverImage?.includes("supabase.co")}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute left-2 top-2">
          <ModTag label={tag} />
        </div>
        <button
          className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white/60 backdrop-blur transition hover:text-white"
          aria-label="Favorite"
          onClick={(event) => event.preventDefault()}
        >
          <Star className="size-3.5" />
        </button>
      </div>
      <div className="p-2.5">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {mod.character}
        </p>
        <h3 className="mb-1 line-clamp-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/50 group-hover:text-white transition-colors">
          {mod.title.length > 8 ? `${mod.title.slice(0, 8)}...` : mod.title}
        </h3>
        <p className="mb-2 text-[10px] text-slate-500">
          By {mod.modAuthorUrl ?? "WaveMod"}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-0.5">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {mod.ratingAverage.toFixed(1)}
          </span>
          <span className="text-slate-600">·</span>
          <span>{(mod.downloads / 1000).toFixed(1)}K</span>
        </div>
      </div>
    </Link>
  );
}

export function WuwaFeaturedModsRail({ mods }: { mods: SiteMod[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const scrollBy = (direction: number) =>
    railRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
          Featured Mods
        </h2>
        <div className="flex items-center gap-3">
          <Link
            href="/mods"
            className="text-xs font-semibold uppercase tracking-wider text-blue-400 hover:text-blue-300"
          >
            View All
          </Link>
          <div className="flex gap-1">
            <button
              onClick={() => scrollBy(-1)}
              className="rounded border border-white/10 bg-white/5 p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Scroll left"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="rounded border border-white/10 bg-white/5 p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Scroll right"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
      {mods.length > 0 ? (
        <div
          ref={railRef}
          className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {mods.map((mod, index) => (
            <FeaturedModCard key={mod.id} mod={mod} index={index} />
          ))}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-white/5 bg-[#161b22] text-sm text-slate-500">
          暂无精选 MOD，发布后自动展示
        </div>
      )}
    </section>
  );
}
