import Link from "next/link";

import type { GameConfig } from "@/config/games";
import type { SiteMod, TopCreator } from "@/lib/mods";
import { buildZenlessModsHref, zenlessCategories } from "./zenless-mods-data";

/** 格式化下载量显示 */
function compactDownloads(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** 占位创作者条目 */
function PlaceholderCreator({ rank }: { rank: number }) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-center gap-1.5 opacity-40">
      <span className="flex size-5 items-center justify-center border-2 border-black bg-[var(--neo-secondary)] text-[8px] font-black">
        {rank}
      </span>
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-black bg-[var(--neo-muted)] text-[10px] font-black">
        -
      </span>
      <span>
        <span className="block truncate text-[11px] font-black">虚位以待</span>
        <span className="block text-[9px] font-bold text-black/55">---</span>
      </span>
    </div>
  );
}

function RailPanel({
  children,
  href,
  title,
}: {
  children: React.ReactNode;
  href: string;
  title: string;
}) {
  return (
    <section className="border-4 border-black bg-[var(--neo-panel)] p-2 text-black shadow-[4px_4px_0_0_#000]">
      <div className="mb-5.5 flex items-center justify-between border-b-4 border-black pb-1.5">
        <h2 className="text-[9px] font-black uppercase tracking-[0.12em]">
          {title}
        </h2>
        <a href={href} className="text-[7px] font-black uppercase underline">
          查看全部
        </a>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function ZenlessModsRail({
  game,
  mods,
  topCreators,
  trendingMods,
}: {
  game: GameConfig;
  mods: SiteMod[];
  topCreators: TopCreator[];
  trendingMods: SiteMod[];
}) {
  return (
    <aside className="space-y-1.5">
      <RailPanel href={game.nav.mods} title="热门分类">
        {zenlessCategories.map(([Icon, label, query, count], index) => (
          <Link
            key={label}
            href={buildZenlessModsHref(game, "hot", undefined, query)}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 border-2 border-black bg-white px-1.5 py-1 shadow-[2px_2px_0_0_#000]"
          >
            <span
              className={`flex size-5 items-center justify-center border-2 border-black ${index % 3 === 0 ? "bg-[var(--neo-accent)]" : index % 3 === 1 ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]"}`}
            >
              <Icon className="size-2.5" />
            </span>
            <span className="text-[9px] font-black">{label}</span>
            <span className="text-[8px] font-black text-black/55">{count}</span>
          </Link>
        ))}
      </RailPanel>
      <RailPanel href={`${game.nav.mods}?sort=hot`} title="优秀创作者">
        {Array.from({ length: 5 }).map((_, index) => {
          const creator = topCreators[index];
          if (!creator) return <PlaceholderCreator key={`placeholder-${index}`} rank={index + 1} />;

          const initials = creator.displayName.slice(0, 1).toUpperCase();
          const tone = index % 2 ? "bg-[var(--neo-muted)]" : "bg-[var(--neo-accent)]";

          return (
            <Link
              key={creator.userId}
              href={`${game.nav.profile ?? `${game.nav.home}/profile`}?user=${creator.userId}`}
              className="grid grid-cols-[auto_auto_1fr] items-center gap-1.5 border-2 border-black bg-white p-1.5 shadow-[2px_2px_0_0_#000] transition hover:-translate-y-0.5"
            >
              <span className="flex size-5 items-center justify-center border-2 border-black bg-[var(--neo-secondary)] text-[8px] font-black">
                {index + 1}
              </span>
              <span
                className={`flex size-6 items-center justify-center rounded-full border-2 border-black text-[10px] font-black ${tone}`}
              >
                {initials}
              </span>
              <span>
                <span className="block truncate text-[11px] font-black">
                  {creator.displayName}
                </span>
                <span className="block text-[9px] font-bold text-black/55">
                  {compactDownloads(creator.totalDownloads)} 下载
                </span>
              </span>
            </Link>
          );
        })}
      </RailPanel>
      <RailPanel
        href={buildZenlessModsHref(game, "hot")}
        title="本周热门"
      >
        {(trendingMods.length > 0 ? trendingMods : mods).slice(0, 4).map((mod, index) => (
          <Link
            key={mod.id}
            href={`${game.nav.mods}/${mod.id}`}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 border-2 border-black bg-white p-1.5 shadow-[2px_2px_0_0_#000]"
          >
            <span className="text-[10px] font-black">{index + 1}</span>
            <span className="truncate text-[10px] font-black">
              {mod.title}
            </span>
            <span className="text-[8px] font-black">
              {mod.views >= 1000 ? `${(mod.views / 1000).toFixed(1)}K` : mod.views}
            </span>
          </Link>
        ))}
      </RailPanel>
    </aside>
  );
}
