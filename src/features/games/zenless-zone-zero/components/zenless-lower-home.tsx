import Image from "next/image";
import Link from "next/link";
import {
  Download,
  Grid3X3,
  Star,
  Upload,
  Users,
  WandSparkles,
  Zap,
} from "lucide-react";

import multiAgentPlaceholder from "../../../../../bg-zzz/多人占位.png";
import pinkWideBackground from "../../../../../bg-zzz/长图粉色.png";
import { isExternalStorageUrl } from "@/lib/storage/shared";

import { MotionReveal } from "@/components/layout/motion-reveal";
import type { GameConfig } from "@/config/games";
import type { SiteMod } from "@/lib/mods";

const statsBackgroundPositionY = 25;
const statsBackgroundScale = 1;
const creatorBackgroundPositionY = 15;
const creatorBackgroundScale = 1;

function getBackgroundSize(scale: number) {
  return `${scale * 100}% auto`;
}

const stats = [
  { icon: Download, value: "25K+", label: "MOD 可用" },
  { icon: Users, value: "18K+", label: "代理人访问" },
  { icon: Star, value: "4.9", label: "用户评分" },
  { icon: Grid3X3, value: "100+", label: "分类标签" },
  { icon: Zap, value: "Daily", label: "每日更新" },
] as const;

const categories = [
  { icon: "👤", name: "代理人外观", query: "角色", count: "1,323" },
  { icon: "🧥", name: "服装皮肤", query: "皮肤", count: "986" },
  { icon: "⚔️", name: "武器替换", query: "武器", count: "652" },
  { icon: "🖥️", name: "UI 视觉", query: "UI", count: "412" },
  { icon: "🎮", name: "玩法增强", query: "玩法", count: "231" },
  { icon: "🎵", name: "音效语音", query: "音效", count: "143" },
] as const;

const creators = [
  { name: "NewEriduLab", followers: "10.5K" },
  { name: "HollowWorks", followers: "12.1K" },
  { name: "ProxyForge", followers: "8.7K" },
  { name: "BunnyHouse", followers: "7.3K" },
  { name: "Section6", followers: "9.2K" },
  { name: "LuminaMods", followers: "6.2K" },
] as const;

const displayMods = [
  { character: "星见雅", title: "星见雅 · 霜刃行动套装" },
  { character: "艾莲", title: "艾莲 · 深海巡游外观" },
  { character: "妮可", title: "妮可 · 狡兔屋霓虹制服" },
  { character: "安比", title: "安比 · 电光战术服" },
] as const;

const fallbackUpdates = [
  {
    title: "绝区零分站首屏上线",
    desc: "New Eridu layout ready",
    time: "Just now",
    badge: "NEW",
  },
  {
    title: "代理人外观分类预热",
    desc: "星见雅、艾莲、妮可",
    time: "5h ago",
    badge: null,
  },
  {
    title: "XXMI 指引入口更新",
    desc: "一键跳转安装教程",
    time: "1d ago",
    badge: null,
  },
  {
    title: "直链下载体验优化",
    desc: "OSS 高速下载预留",
    time: "2d ago",
    badge: null,
  },
] as const;

function ZenlessStatsBar() {
  return (
    <div
      className="group/stats relative grid overflow-hidden border-2 border-black bg-white py-0 text-black shadow-[7px_7px_0px_0px_#000] transition-all duration-300 ease-out hover:py-20 sm:grid-cols-5"
      style={{
        backgroundImage: `url(${multiAgentPlaceholder})`,
        backgroundPosition: `center ${statsBackgroundPositionY}%`,
        backgroundRepeat: "no-repeat",
        backgroundSize: getBackgroundSize(statsBackgroundScale),
      }}
    >
      <div className="absolute inset-0 bg-white/8" />
      {stats.map(({ icon: Icon, label, value }, index) => {
        // const dividerClass = index > 0 ? "border-t-4 sm:border-l-4 sm:border-t-0" : "";
        // const toneClass = index % 3 === 0 ? "bg-[var(--neo-accent)]/76" : index % 3 === 1 ? "bg-white/78" : "bg-[var(--neo-muted)]/76";

        return (
          <MotionReveal
            key={label}
            delay={0.06 + index * 0.03}
            y={18}
            rotate={index % 2 === 0 ? -1 : 1}
          >
            <div className="relative z-10 flex min-w-0 items-center gap-2 border-black px-3 py-2.5 transition-all duration-300 ease-out group-hover/stats:gap-1.5 group-hover/stats:px-2 group-hover/stats:py-1.5">
              <div className="flex size-9 shrink-0 items-center justify-center border-2 border-black bg-white/85 transition-all duration-300 ease-out group-hover/stats:size-7 group-hover/stats:bg-white/72">
                <Icon className="size-4 transition-all duration-300 ease-out group-hover/stats:size-3.5" />
              </div>
              <div className="min-w-0 transition-all duration-300 ease-out group-hover/stats:scale-90 group-hover/stats:opacity-90">
                <p className="text-base font-black leading-none text-black">
                  {value}
                </p>
                <p className="mt-1 truncate text-[9px] font-black uppercase tracking-[0.16em] text-black/62">
                  {label}
                </p>
              </div>
            </div>
          </MotionReveal>
        );
      })}
    </div>
  );
}

function ZenlessFeaturedCard({
  game,
  index,
  mod,
}: {
  game: GameConfig;
  index: number;
  mod: SiteMod;
}) {
  const tag = ["HOT", "TRENDING", "NEW", "AGENT"][index % 4];
  const display = displayMods[index % displayMods.length];

  return (
    <Link
      href={`${game.nav.mods}/${mod.id}`}
      className="group block min-w-[190px] overflow-hidden border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition duration-100 hover:-translate-y-1 hover:shadow-[9px_9px_0px_0px_#000]"
    >
      <div className="relative h-[104px] overflow-hidden border-b-4 border-black bg-black">
        <Image
          src={mod.coverImage}
          alt=""
          fill
          sizes="210px"
          className="scale-110 object-cover blur-xl"
          aria-hidden="true"
          unoptimized={isExternalStorageUrl(mod.coverImage ?? "")}
        />
        <Image
          src={mod.coverImage}
          alt={mod.title}
          fill
          sizes="210px"
          className="object-contain object-center transition duration-500 group-hover:scale-105"
          unoptimized={isExternalStorageUrl(mod.coverImage ?? "")}
        />
        <span
          className={`absolute left-2 top-2 border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] ${index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]"}`}
        >
          {tag}
        </span>
      </div>
      <div className="space-y-1.5 p-2.5">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/55">
          {display.character}
        </p>
        <h3 className="line-clamp-1 text-xs font-black uppercase leading-tight text-black">
          {display.title}
        </h3>
        <div className="flex items-center justify-between text-[10px] font-black text-black/68">
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-[#ffb000] text-[#ffb000]" />
            {mod.ratingAverage.toFixed(1)}
          </span>
          <span>{Math.max(0.1, mod.downloads / 1000).toFixed(1)}K 下载</span>
        </div>
      </div>
    </Link>
  );
}

function ZenlessFeaturedMods({
  game,
  mods,
}: {
  game: GameConfig;
  mods: SiteMod[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3">
        <MotionReveal delay={0.08} rotate={-1}>
          <h2 className="shrink-0 border-4 border-black bg-[var(--neo-secondary)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-black shadow-[5px_5px_0px_0px_#000]">
            Featured Mods
          </h2>
        </MotionReveal>
        <div className="h-px flex-1 bg-white/65 shadow-[0_1px_0px_#000]" />
        <MotionReveal delay={0.12} rotate={1}>
          <Link
            href={game.nav.mods}
            className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-white underline decoration-[var(--neo-accent)] decoration-4 underline-offset-4"
          >
            View All
          </Link>
        </MotionReveal>
      </div>
      {mods.length > 0 ? (
        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,rgba(255,255,255,0.2),white_15%,white_85%,rgba(255,255,255,0.2))]">
          <div className="flex w-max gap-3 py-2 zzz-marquee-track">
            {mods.slice(0, 6).map((mod, index) => (
              <ZenlessFeaturedCard
                key={mod.id}
                game={game}
                index={index}
                mod={mod}
              />
            ))}
            {mods.slice(0, 6).map((mod, index) => (
              <ZenlessFeaturedCard
                key={`dup-${mod.id}`}
                game={game}
                index={index}
                mod={mod}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="border-4 border-black bg-white p-4 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
          暂无精选 MOD，发布后自动展示。
        </div>
      )}
    </section>
  );
}

function ZenlessLatestUpdates({
  game,
  mods,
}: {
  game: GameConfig;
  mods: SiteMod[];
}) {
  const updates =
    mods.length > 0
      ? mods.slice(0, 4).map((mod, index) => {
          const display = displayMods[index % displayMods.length];

          return {
            title: display.title,
            desc: display.character || "代理人 MOD",
            time: index === 0 ? "Just now" : `${index + 2}h ago`,
            badge: index === 0 ? "NEW" : null,
          };
        })
      : fallbackUpdates;

  return (
    <section className="border-4 border-black bg-[var(--neo-panel)] p-3 text-black shadow-[7px_7px_0px_0px_#000]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-[0.16em]">
          Latest Updates
        </h3>
        <Link
          href={`${game.nav.mods}?sort=latest`}
          className="text-[9px] font-black uppercase tracking-[0.14em] underline decoration-2"
        >
          View All
        </Link>
      </div>
      <div className="space-y-2">
        {updates.map((update, index) => (
          <div
            key={`${update.title}-${index}`}
            className="flex items-center gap-2 border-2 border-black bg-white/86 px-2 py-1.5 shadow-[3px_3px_0px_0px_#000]"
          >
            <div className="flex size-7 shrink-0 items-center justify-center border-2 border-black bg-[var(--neo-secondary)] text-xs font-black">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-black leading-tight">
                {update.title}
              </p>
              <p className="truncate text-[9px] font-bold text-black/55">
                {update.desc}
              </p>
            </div>
            {update.badge ? (
              <span className="border-2 border-black bg-[var(--neo-accent)] px-1.5 py-0.5 text-[8px] font-black shadow-[2px_2px_0px_0px_#000]">
                {update.badge}
              </span>
            ) : null}
            <span className="text-[9px] font-black text-black/48">
              {update.time}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ZenlessPopularCategories({ game }: { game: GameConfig }) {
  return (
    <section className="border-4 border-black bg-white p-3 text-black shadow-[7px_7px_0px_0px_#000]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-[0.16em]">
          Popular Categories
        </h3>
        <Link
          href={game.nav.mods}
          className="text-[9px] font-black uppercase tracking-[0.14em] underline decoration-2"
        >
          View All
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {categories.map((category, index) => (
          <Link
            key={category.name}
            href={`${game.nav.mods}?query=${encodeURIComponent(category.query)}`}
            className={`flex items-center gap-2 border-2 border-black px-2 py-1.5 shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 ${index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]"}`}
          >
            <span className="text-sm">{category.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-black leading-tight">
                {category.name}
              </span>
              <span className="block text-[8px] font-bold text-black/55">
                {category.count} mods
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ZenlessCreatorCta() {
  return (
    <div
      className="group/creator relative flex min-h-12 items-center justify-between gap-3 overflow-hidden border-4 border-black bg-[var(--neo-muted)] px-4 py-2 text-black shadow-[7px_7px_0px_0px_#000] transition-all duration-300 ease-out hover:min-h-24 hover:px-5 hover:py-20"
      style={{
        backgroundImage: `url(${pinkWideBackground})`,
        backgroundPosition: `center ${creatorBackgroundPositionY}%`,
        backgroundRepeat: "no-repeat",
        backgroundSize: getBackgroundSize(creatorBackgroundScale),
      }}
    >
      <div className="absolute inset-0 bg-[var(--neo-muted)]/45" />
      <div className="relative z-10 transition-all duration-300 ease-out group-hover/creator:-translate-y-1 group-hover/creator:scale-95 group-hover/creator:opacity-90">
        <h3 className="text-[8px] font-black uppercase leading-tight">
          Create. Share. Inspire.
        </h3>
        <p className="mt-1 text-[10px] font-bold text-black/62">
          成为创作者，分享你的新艾利都 MOD。
        </p>
      </div>
      <Link
        href="/admin/upload"
        className="neo-button-primary relative z-10 inline-flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-all duration-300 ease-out group-hover/creator:translate-y-1 group-hover/creator:scale-90 group-hover/creator:px-3 group-hover/creator:py-1.5"
      >
        <Upload className="size-2.5" />
        Upload
      </Link>
    </div>
  );
}

function ZenlessCreatorsBar() {
  return (
    <div className="flex items-center gap-3 overflow-hidden border-4 border-black bg-white px-3 py-2 text-black shadow-[7px_7px_0px_0px_#000]">
      <p className="shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-black/55">
        Trusted by Creators
      </p>
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {creators.map((creator, index) => (
          <div key={creator.name} className="flex shrink-0 items-center gap-2">
            <div
              className={`flex size-7 items-center justify-center rounded-full border-2 border-black text-[10px] font-black ${index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]"}`}
            >
              {creator.name[0]}
            </div>
            <div>
              <p className="text-[10px] font-black leading-none">
                {creator.name}
              </p>
              <p className="mt-0.5 text-[8px] font-bold text-black/52">
                {creator.followers} Followers
              </p>
            </div>
          </div>
        ))}
      </div>
      <WandSparkles className="size-4 shrink-0" />
    </div>
  );
}

type ZenlessLowerHomeProps = {
  game: GameConfig;
  latestMods: SiteMod[];
  mods: SiteMod[];
};

export function ZenlessLowerHome({
  game,
  latestMods,
  mods,
}: ZenlessLowerHomeProps) {
  return (
    <section className="relative z-10 -mt-14 px-4 pb-6 pt-0 text-white sm:px-5 lg:px-6 2xl:px-4">
      <div className="mx-auto grid max-w-[1500px] gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <MotionReveal delay={0.04} y={24} rotate={-1}>
            <ZenlessStatsBar />
          </MotionReveal>
          <ZenlessFeaturedMods game={game} mods={mods} />
          <MotionReveal delay={0.22} y={24} rotate={1}>
            <ZenlessCreatorCta />
          </MotionReveal>
          <MotionReveal delay={0.26} y={20} rotate={-1}>
            <ZenlessCreatorsBar />
          </MotionReveal>
        </div>
        <aside className="grid gap-3 lg:auto-rows-max">
          <MotionReveal delay={0.18} y={26} rotate={1}>
            <ZenlessLatestUpdates game={game} mods={latestMods} />
          </MotionReveal>
          <MotionReveal delay={0.24} y={26} rotate={-1}>
            <ZenlessPopularCategories game={game} />
          </MotionReveal>
        </aside>
      </div>
    </section>
  );
}
