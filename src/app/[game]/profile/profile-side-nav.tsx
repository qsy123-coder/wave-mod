import Link from "next/link";
import {
  Bell,
  Bookmark,
  Heart,
  Mail,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import { panel } from "./profile-shared";

type SideItem = {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
};

type ProfileSideNavProps = {
  profileHref: string;
  favoritesHref: string;
  editProfileHref: string;
};

export function ProfileSideNav({
  profileHref,
  favoritesHref,
  editProfileHref,
}: ProfileSideNavProps) {
  const items: SideItem[] = [
    { icon: <UserRound className="size-4" />, label: "Profile", href: profileHref, active: true },
    { icon: <Sparkles className="size-4" />, label: "My Mods", href: `${profileHref}?tab=published` },
    { icon: <Bookmark className="size-4" />, label: "Collections", href: favoritesHref },
    { icon: <Users className="size-4" />, label: "Following" },
    { icon: <Heart className="size-4" />, label: "Liked Mods", href: `${profileHref}?tab=favorites` },
    { icon: <Mail className="size-4" />, label: "Messages" },
    { icon: <Bell className="size-4" />, label: "Notifications" },
    { icon: <Settings className="size-4" />, label: "Settings", href: editProfileHref },
  ];

  return (
    <aside className="hidden w-40 shrink-0 xl:flex xl:flex-col min-h-0 overflow-hidden">
      <nav className="flex-1 min-h-0 overflow-hidden space-y-3">
        {items.map((item) => {
          const content = (
            <div
              className={`flex items-center gap-3 border-2 border-black px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5 ${
                item.active
                  ? "bg-[var(--neo-accent)] text-black"
                  : "bg-black/5 text-black hover:bg-[var(--neo-muted)]/60 hover:text-black"
              }`}
            >
              {item.icon}
              {item.label}
            </div>
          );

          if (item.href) {
            return (
              <Link key={item.label} href={item.href}>
                {content}
              </Link>
            );
          }
          return <div key={item.label}>{content}</div>;
        })}
        {/* 占位导航项 */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`ph-nav-${i}`} className="flex items-center gap-3 border-2 border-black/20 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-black/20 opacity-20">
            <div className="size-4 bg-black/20" />
            <span>---</span>
          </div>
        ))}
      </nav>
      <div className="shrink-0 mt-3 border-4 border-black bg-white/30 p-3 sm:p-4 text-center shadow-[5px_5px_0px_0px_#000]">
        <p className="text-[10px] font-bold text-black">Upgrade to</p>
        <p className="mt-1 text-base sm:text-lg font-black text-black">PREMIUM</p>
        <p className="mt-1.5 sm:mt-2 text-[9px] sm:text-[10px] leading-4 text-black">
          Unlock creator analytics and support perks.
        </p>
        <button className="mt-2 sm:mt-3 border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
          Upgrade Now
        </button>
      </div>
    </aside>
  );
}
