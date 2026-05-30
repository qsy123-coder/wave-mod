import Link from "next/link";
import { Bell, ChevronDown, Search, User } from "lucide-react";

const navItems = [
  ["/", "Home"],
  ["/mods", "Browse Mods"],
  ["/mods?character=今汐", "Character Mods"],
  ["/mods?query=weapon", "Weapon Mods"],
  ["/support", "Community"],
  ["/guide", "Tutorials"],
  ["/support", "Support Us"],
] as const;

export function WuwaHomeNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 h-14 border-b border-white/[0.08] bg-[#05070c]/90 shadow-[0_10px_32px_rgba(0,0,0,0.42)] backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-8 xl:px-11">
        <Link href="/" className="flex h-full w-[226px] shrink-0 items-center gap-4 text-white">
          <span className="font-serif text-[34px] font-black uppercase leading-none tracking-[-0.16em] text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.16)]">
            WW
          </span>
          <span className="flex flex-col justify-center leading-none">
            <span className="text-[12px] font-black uppercase italic tracking-[0.24em] text-white">Mod Hub</span>
            <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.34em] text-white/58">Wuthering Waves</span>
          </span>
        </Link>

        <nav className="hidden h-full flex-1 items-center justify-center gap-[34px] lg:flex">
          {navItems.map(([href, label], index) => (
            <Link
              key={`${href}-${label}`}
              href={href}
              className={`group relative flex h-full items-center text-[10px] font-black uppercase tracking-[0.12em] transition ${index === 0 ? "text-white" : "text-white/76 hover:text-white"}`}
            >
              {label}
              {index === 0 ? (
                <>
                  <span className="absolute bottom-0 left-1/2 h-px w-8 -translate-x-1/2 bg-[#5aa7ff] shadow-[0_0_12px_rgba(90,167,255,0.9)]" />
                  <span className="absolute bottom-[5px] left-1/2 h-px w-5 -translate-x-1/2 bg-white/70" />
                </>
              ) : (
                <span className="absolute bottom-0 left-1/2 h-px w-0 -translate-x-1/2 bg-[#5aa7ff] transition-all group-hover:w-7" />
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex h-full w-[206px] shrink-0 items-center justify-end gap-5 text-white/78">
          <Link href="/mods" aria-label="Search" className="transition hover:text-white">
            <Search className="size-[17px] stroke-[2.2]" />
          </Link>
          <Link href="/favorites" aria-label="Notifications" className="transition hover:text-white">
            <Bell className="size-[15px] fill-white/72 stroke-[2.2]" />
          </Link>
          <Link href="/auth/login" className="flex items-center gap-2.5 text-[11px] font-medium text-white/82 transition hover:text-white">
            <span className="flex size-7 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-gradient-to-br from-[#d8d5ef] via-[#8d8faa] to-[#303746] shadow-[0_0_18px_rgba(120,150,255,0.22)]">
              <User className="size-4 text-white" />
            </span>
            <span>Waver123</span>
            <ChevronDown className="size-3 text-white/55" />
          </Link>
        </div>
      </div>
    </header>
  );
}
