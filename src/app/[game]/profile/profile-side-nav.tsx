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
    <aside className="hidden w-40 shrink-0 space-y-3 xl:block">
      {items.map((item) => {
        const content = (
          <div
            className={`flex items-center gap-3 border-2 border-black px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5 ${
              item.active
                ? "bg-[#13244a]/80 text-white"
                : "bg-[#07111f]/45 text-slate-400 hover:bg-[#0f1d35]/60 hover:text-slate-300"
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
      <div className={`${panel} mt-28 p-4 text-center`}>
        <p className="text-[10px] font-bold text-slate-400">Upgrade to</p>
        <p className="mt-1 text-lg font-black text-white">PREMIUM</p>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Unlock creator analytics and support perks.
        </p>
        <button className="mt-3 border-2 border-black bg-[#1f2a44] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_0_#000]">
          Upgrade Now
        </button>
      </div>
    </aside>
  );
}
