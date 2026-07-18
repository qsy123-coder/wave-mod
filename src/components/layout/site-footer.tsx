import Link from "next/link";

import { siteConfig } from "@/lib/constants/site";

export function SiteFooter() {
  return (
    <footer className="border-t-4 border-black" style={{ background: "var(--neo-footer)" }}>
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex items-center gap-3">
          <p className="text-xs font-black text-black/70">WaveMod — 鸣潮角色MOD个人站</p>
          <span className="text-[10px] text-black/40">{siteConfig.disclaimer}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {siteConfig.supportLinks.map((item, index) => (
            <Link
              key={item.label}
              href={item.href}
              className={`border-[3px] border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 ${index % 2 === 0 ? "bg-[var(--neo-accent)]" : "bg-white"}`}
                >
                  {item.label}
                </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
