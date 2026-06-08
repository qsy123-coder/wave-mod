import Image from "next/image";
import Link from "next/link";
import { Bell, Bookmark, Crown, Download, Edit3, Heart, Mail, Medal, Settings, ShieldCheck, Sparkles, Star, Trophy, UserRound, Users } from "lucide-react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { getFeaturedMods } from "@/lib/mods";
import type { SiteMod } from "@/lib/mods";

type PageProps = { params: Promise<{ game: string }> };

type StatItem = { label: string; value: string };
type SideItem = { icon: React.ReactNode; label: string };

const panel = "border-4 border-black bg-[#07111f]/42 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 backdrop-blur-[2px]";
const compact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

function sum(mods: SiteMod[], pick: (mod: SiteMod) => number) {
  return mods.reduce((total, mod) => total + pick(mod), 0);
}

function SideNav() {
  const items: SideItem[] = [
    { icon: <UserRound className="size-4" />, label: "Profile" },
    { icon: <Sparkles className="size-4" />, label: "My Mods" },
    { icon: <Bookmark className="size-4" />, label: "Collections" },
    { icon: <Users className="size-4" />, label: "Following" },
    { icon: <Heart className="size-4" />, label: "Liked Mods" },
    { icon: <Mail className="size-4" />, label: "Messages" },
    { icon: <Bell className="size-4" />, label: "Notifications" },
    { icon: <Settings className="size-4" />, label: "Settings" },
  ];

  return <aside className="hidden w-40 shrink-0 space-y-3 xl:block">{items.map((item, index) => <div key={item.label} className={`flex items-center gap-3 border-2 border-black px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#000] ${index === 0 ? "bg-[#13244a]/80 text-white" : "bg-[#07111f]/45 text-slate-400"}`}>{item.icon}{item.label}</div>)}<div className={`${panel} mt-28 p-4 text-center`}><p className="text-[10px] font-bold text-slate-400">Upgrade to</p><p className="mt-1 text-lg font-black text-white">PREMIUM</p><p className="mt-2 text-[10px] leading-4 text-slate-500">Unlock creator analytics and support perks.</p><button className="mt-3 border-2 border-black bg-[#1f2a44] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_0_#000]">Upgrade Now</button></div></aside>;
}

function ModMiniCard({ href, mod, tone }: { href: string; mod: SiteMod; tone: string }) {
  return <Link href={href} className="group block overflow-hidden border-2 border-black bg-[#08111f]/70 shadow-[4px_4px_0_0_#000] transition hover:-translate-y-1"><div className="relative h-36 bg-black"><Image src={mod.coverImage} alt={mod.title} fill sizes="280px" className="object-cover transition duration-300 group-hover:scale-105" /><span className={`absolute left-2 top-2 border border-black px-1.5 py-0.5 text-[9px] font-black uppercase ${tone}`}>{mod.nsfw ? "NSFW" : mod.tags[0] ?? "Hot"}</span><span className="absolute right-2 top-2 border border-black bg-[#07111f]/80 px-1.5 py-0.5 text-[9px] font-black text-white">{mod.version}</span></div><div className="p-3"><p className="line-clamp-1 text-sm font-black text-white">{mod.title}</p><p className="mt-1 line-clamp-1 text-[11px] font-bold text-slate-500">{mod.character}</p><div className="mt-3 flex items-center gap-4 text-[10px] font-black text-slate-400"><span className="inline-flex items-center gap-1"><Download className="size-3" />{compact(mod.downloads)}</span><span className="inline-flex items-center gap-1"><Heart className="size-3" />{compact(mod.favorites)}</span><span className="inline-flex items-center gap-1"><Star className="size-3 fill-slate-300 text-slate-300" />{mod.ratingAverage.toFixed(1)}</span></div></div></Link>;
}

function RightRail({ mods, totalLikes }: { mods: SiteMod[]; totalLikes: number }) {
  const supporters = ["StellarDream", "Lunaris", "FrostByte", "Arkanist", "Nightfall"];
  return <aside className="space-y-4"><section className={`${panel} p-4`}><h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">About Me</h3><p className="mt-3 text-xs font-bold leading-5 text-slate-400">Modder and designer passionate about Wuthering Waves. I love creating high-quality, lore-friendly mods that enhance immersion.</p><div className="mt-4 flex gap-2 text-slate-300"><ShieldCheck className="size-4" /><Sparkles className="size-4" /><Crown className="size-4" /><Trophy className="size-4" /></div></section><section className={`${panel} p-4`}><div className="flex items-center justify-between"><h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">Creator Badges</h3><span className="text-[9px] font-black text-slate-500">View all</span></div><div className="mt-4 grid grid-cols-4 gap-3">{[Medal, ShieldCheck, Crown, Trophy].map((Icon, index) => <div key={index} className="flex aspect-square items-center justify-center border-2 border-black bg-[#0b1220]/70 shadow-[2px_2px_0_0_#000]"><Icon className="size-5 text-slate-200" /></div>)}</div></section><section className={`${panel} p-4`}><h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">Top Supporters</h3><div className="mt-3 space-y-2">{supporters.map((name, index) => <div key={name} className="flex items-center justify-between text-[11px] font-bold text-slate-400"><span className="inline-flex items-center gap-2"><span className="relative size-5 overflow-hidden rounded-full border border-black bg-[#111827]"><Image src={mods[index % Math.max(1, mods.length)]?.coverImage ?? "/bg-zzz/zzz-detail-bg.png"} alt={name} fill sizes="20px" className="object-cover" /></span>{name}</span><span>{compact(totalLikes / (index + 2))}</span></div>)}</div></section></aside>;
}

export default async function GameProfilePage({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);
  if (!game) notFound();

  const mods = await getFeaturedMods(8, game.key);
  const published = mods.slice(0, 4);
  const featured = published[0] ?? mods[0];
  const cover = featured?.coverImage ?? "/bg-zzz/zzz-detail-bg.png";
  const totalDownloads = sum(mods, (mod) => mod.downloads);
  const totalFavorites = sum(mods, (mod) => mod.favorites);
  const totalLikes = sum(mods, (mod) => mod.likes);
  const stats: StatItem[] = [
    { label: "Mods Published", value: String(Math.max(12, mods.length * 18)) },
    { label: "Total Downloads", value: compact(totalDownloads || 2450000) },
    { label: "Followers", value: compact(totalFavorites || 12800) },
    { label: "Following", value: "180" },
    { label: "Likes Received", value: compact(totalLikes || 98700) },
  ];

  return <main className="relative -mt-[74px] min-h-screen overflow-hidden bg-[#04070d] pt-[86px] text-white"><div className="absolute inset-0"><Image src="/bg-zzz/zzz-detail-bg.png" alt="profile background" fill priority sizes="100vw" className="object-cover object-center" /><div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_0%,rgba(118,141,255,0.2),transparent_32%),linear-gradient(90deg,rgba(4,7,13,0.96),rgba(4,7,13,0.62)_45%,rgba(4,7,13,0.92))]" /></div><div className="relative z-10 mx-auto flex w-full max-w-[1500px] gap-5 px-5 pb-8 lg:px-8"><SideNav /><div className="min-w-0 flex-1"><section className={`${panel} relative min-h-[260px] overflow-hidden`}><Image src={cover} alt="creator cover" fill sizes="1200px" className="object-cover object-[center_28%] opacity-70" /><div className="absolute inset-0 bg-gradient-to-t from-[#04070d] via-[#04070d]/30 to-transparent" /><div className="relative flex min-h-[260px] items-end justify-between gap-4 p-5"><div className="flex flex-wrap items-end gap-5"><div className="relative size-28 overflow-hidden rounded-full border-4 border-black bg-[#111827] shadow-[5px_5px_0_0_#000]"><Image src={cover} alt="Waver123" fill sizes="112px" className="object-cover" /></div><div className="pb-1"><h1 className="text-3xl font-black text-white [text-shadow:3px_3px_0_#000]">Waver123</h1><p className="mt-1 text-sm font-bold text-slate-300">Resonating creativity, one mod at a time.</p><div className="mt-2 flex flex-wrap gap-2"><span className="border-2 border-black bg-[#1f2a44]/80 px-2 py-0.5 text-[10px] font-black uppercase text-white">Creator</span><span className="border-2 border-black bg-[#21315f]/80 px-2 py-0.5 text-[10px] font-black uppercase text-white">Top Creator</span><span className="border-2 border-black bg-[#07111f]/80 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">Huanglong, Solaris-3</span></div></div></div><button className="hidden border-2 border-black bg-[#07111f]/70 px-3 py-2 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_0_#000] md:inline-flex"><Edit3 className="mr-2 size-3" />Edit Profile</button></div></section><section className={`${panel} mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5`}>{stats.map((stat) => <div key={stat.label} className="border-r border-white/10 last:border-r-0"><p className="text-2xl font-black text-white">{stat.value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{stat.label}</p></div>)}</section><div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-4"><section className={`${panel} p-4`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-6 text-[11px] font-black uppercase tracking-[0.14em]"><span className="text-white">Published Mods</span><span className="text-slate-500">Collections</span><span className="text-slate-500">Liked Mods</span></div><div className="flex gap-2 text-[10px] font-bold text-slate-400"><span className="border border-white/10 bg-black/20 px-3 py-1">All Categories</span><span className="border border-white/10 bg-black/20 px-3 py-1">Newest</span></div></div><div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{published.map((mod, index) => <ModMiniCard key={mod.id} href={`${game.nav.mods}/${mod.id}`} mod={mod} tone={index === 0 ? "bg-[#611b25] text-white" : index === 1 ? "bg-[#123d2a] text-[#b4ffcb]" : "bg-[#1d2c4a] text-[#c7d8ff]"} />)}</div></section><section className={`${panel} p-4`}><h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">Recent Activity</h3><div className="mt-3 grid gap-3 lg:grid-cols-3">{mods.slice(0, 3).map((mod, index) => <div key={mod.id} className="flex gap-3 border border-white/10 bg-[#050914]/35 p-2"><div className="relative size-12 shrink-0 overflow-hidden border-2 border-black bg-black"><Image src={mod.coverImage} alt={mod.title} fill sizes="48px" className="object-cover" /></div><div><p className="line-clamp-2 text-[11px] font-black text-white">{index === 0 ? "Updated" : index === 1 ? "Uploaded new mod" : "Optimized"} · {mod.title}</p><p className="mt-1 text-[10px] font-bold text-slate-500">{index + 1} day ago</p></div></div>)}</div></section></div><RightRail mods={mods} totalLikes={totalLikes || 98700} /></div></div></div></main>;
}
