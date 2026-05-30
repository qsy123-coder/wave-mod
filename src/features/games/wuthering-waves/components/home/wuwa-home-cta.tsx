import Link from "next/link";
import { Upload } from "lucide-react";

const creators = [
  { name: "MirageMods", followers: "10.5K" },
  { name: "EtherealWorks", followers: "12.1K" },
  { name: "StellarForge", followers: "8.7K" },
  { name: "Lunaris", followers: "7.3K" },
  { name: "Arkanist", followers: "9.2K" },
  { name: "HorizonLabs", followers: "6.2K" },
];

export function WuwaCtaBanner() {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-white/5 bg-[#161b22] px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <h3 className="mb-1 text-base font-black text-white">Create. Share. Inspire.</h3>
        <p className="text-xs text-slate-400">Become a creator and share your mods with the community.</p>
      </div>
      <Link href="/admin/upload" className="inline-flex flex-shrink-0 items-center gap-2 rounded bg-blue-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-blue-400">
        <Upload className="size-3.5" />Upload Your Mod
      </Link>
    </div>
  );
}

export function WuwaCreatorsBar() {
  return (
    <div className="border-t border-white/5 bg-[#0d1117]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-6 py-3 md:px-10 lg:px-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Trusted by Creators Worldwide</p>
        <div className="flex flex-wrap gap-4">
          {creators.map((creator) => (
            <div key={creator.name} className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-[10px] font-black text-white">{creator.name[0]}</div>
              <div>
                <p className="text-[11px] font-semibold text-white">{creator.name}</p>
                <p className="text-[9px] text-slate-500">{creator.followers} Followers</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
