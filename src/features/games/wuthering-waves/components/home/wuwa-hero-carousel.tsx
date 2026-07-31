"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import type { SiteMod } from "@/lib/mods-domain/types";
import { isExternalStorageUrl } from "@/lib/storage/shared";

export function WuwaHeroCarousel({ mods }: { mods: SiteMod[] }) {
  const [current, setCurrent] = useState(0);
  const total = Math.max(mods.length, 1);

  const prev = () => setCurrent((value) => (value - 1 + total) % total);
  const next = () => setCurrent((value) => (value + 1) % total);

  useEffect(() => {
    if (total <= 1) return;

    const id = window.setInterval(() => {
      setCurrent((value) => (value + 1) % total);
    }, 6000);
    return () => window.clearInterval(id);
  }, [total]);

  const mod = mods[current];

  return (
    <div className="relative h-[360px] w-full overflow-hidden md:h-[390px] xl:h-[430px]">
      <div className="absolute inset-0">
        {mod ? (
          <Image src={mod.coverImage} alt={mod.title} fill priority className="object-cover object-center" sizes="100vw" unoptimized={isExternalStorageUrl(mod.coverImage ?? "")} />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      </div>

      <div className="relative flex h-full max-w-7xl flex-col justify-center px-6 pt-14 md:px-10 lg:px-16">
        <div className="max-w-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-300">Shape Your World</p>
          <h1 className="mb-3 text-4xl font-black uppercase leading-none tracking-tight text-white md:text-5xl lg:text-6xl">
            Wuthering Waves<br />Mod Hub
          </h1>
          <p className="mb-1 text-base font-semibold italic text-slate-200">Explore. Customize. Evolve.</p>
          <p className="mb-5 max-w-sm text-xs leading-relaxed text-slate-300">
            The ultimate destination for high-quality mods.<br />Enhance your journey in Wuthering Waves.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/mods" className="inline-flex items-center gap-2 rounded bg-blue-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-blue-400">
              Browse Mods<ChevronRight className="size-4" />
            </Link>
            <Link href="/guide" className="inline-flex items-center gap-2 rounded border border-white/30 bg-white/10 px-5 py-2.5 text-xs font-bold text-white backdrop-blur transition hover:bg-white/20">
              Join Community<Users className="size-4" />
            </Link>
          </div>
        </div>

        <div className="absolute bottom-4 left-6 flex items-center gap-3 md:left-10 lg:left-16">
          <span className="text-xs font-bold text-white/60">{String(current + 1).padStart(2, "0")}</span>
          <div className="flex gap-1.5">
            {Array.from({ length: total }).map((_, index) => (
              <button key={index} onClick={() => setCurrent(index)} className={`h-0.5 transition-all ${index === current ? "w-8 bg-white" : "w-4 bg-white/30"}`} aria-label={`Slide ${index + 1}`} />
            ))}
          </div>
          <span className="text-xs font-bold text-white/30">{String(total).padStart(2, "0")}</span>
        </div>
      </div>

      <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 md:right-10 lg:right-16 xl:block">
        <div className="w-52 rounded-lg border border-white/10 bg-black/60 p-4 backdrop-blur-md">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">New Update &nbsp; v2.3.1</p>
          <h3 className="mb-2 text-xl font-black uppercase leading-tight text-amber-400">Resonant<br />Echoes</h3>
          <p className="mb-3 text-xs leading-relaxed text-slate-300">New mods, characters, and content await your exploration.</p>
          <Link href="/mods?sort=latest" className="block rounded border border-amber-400/60 bg-transparent px-4 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-amber-400 transition hover:bg-amber-400/10">
            Explore Now
          </Link>
        </div>
      </div>

      <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60" aria-label="Previous">
        <ChevronLeft className="size-5" />
      </button>
      <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 xl:right-[18rem]" aria-label="Next">
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
