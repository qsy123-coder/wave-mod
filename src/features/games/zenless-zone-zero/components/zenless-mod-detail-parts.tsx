import Image from "next/image";
import Link from "next/link";
import {
  Download,
  Eye,
  FileArchive,
  Heart,
  ShieldCheck,
  ThumbsUp,
  UserRound,
} from "lucide-react";

import { ModCard } from "@/components/common/mod-card";
import { DownloadButton } from "@/components/features/mods/detail/download-button";
import { FavoriteButton } from "@/components/features/mods/detail/favorite-button";
import { LikeButton } from "@/components/features/mods/detail/like-button";
import { MiniRatingControl, RatingPanel } from "@/components/features/mods/detail/rating-panel";
import type { GameConfig } from "@/config/games";
import type { SiteMod } from "@/lib/mods";

export const compactZenlessNumber = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

export function getZenlessGallery(mod: SiteMod) {
  return [mod.coverImage, ...mod.images]
    .filter((src, index, list) => src && list.indexOf(src) === index)
    .slice(0, 5);
}

export function ZenlessHeroActions({
  detailPath,
  loggedIn,
  mod,
}: {
  detailPath: string;
  loggedIn: boolean;
  mod: SiteMod;
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <div className="w-[192px] max-w-full">
        <DownloadButton
          modId={mod.id}
          downloadUrl={mod.downloadUrl}
          downloadCount={mod.downloads}
          driveLinks={mod.driveLinks}
        />
      </div>
      <FavoriteButton
        compact
        id={mod.id}
        favoriteCount={mod.favorites}
        isFavorited={Boolean(mod.isFavorited)}
        isLoggedIn={loggedIn}
        nextPath={detailPath}
        loginLabel="登录收藏"
        className="min-w-[108px] justify-center gap-2 border-2 border-black bg-[#0b1220]/78 px-3 text-slate-100 shadow-[4px_4px_0px_0px_#000] backdrop-blur-[2px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none [&>svg]:shrink-0 [&>svg]:text-slate-100"
      />
      <LikeButton
        compact
        modId={mod.id}
        isLiked={Boolean(mod.isLiked)}
        isLoggedIn={loggedIn}
        likeCount={mod.likes}
        nextPath={detailPath}
        className="min-w-[108px] justify-center gap-2 border-2 border-black bg-[#111827]/78 px-3 text-slate-100 shadow-[4px_4px_0px_0px_#000] backdrop-blur-[2px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none [&>svg]:shrink-0 [&>svg]:text-slate-100"
      />
      <MiniRatingControl
        isLoggedIn={loggedIn}
        modId={mod.id}
        nextPath={detailPath}
        ratingAverage={mod.ratingAverage}
        ratingCount={mod.ratingCount}
        userRating={mod.userRating ?? null}
      />
    </div>
  );
}

export function ZenlessDarkPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-4 border-black bg-[#07111f]/42 p-2 text-slate-100 shadow-[4px_4px_0px_0px_#000] ring-1 ring-white/10 backdrop-blur-[2px]">
      <h2 className="inline-flex border-2 border-black bg-[#111827]/58 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-100 shadow-[2px_2px_0px_0px_#000] backdrop-blur-[2px]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px] font-bold leading-4 text-slate-400">
      <dt>{label}</dt>
      <dd className="text-right font-black text-white">{value}</dd>
    </div>
  );
}

function RailDownloadButton({ downloadUrl }: { downloadUrl: string | null }) {
  const disabled = !downloadUrl?.trim();
  return (
    <Link
      href={disabled ? "#" : (downloadUrl ?? "#")}
      target={disabled ? undefined : "_blank"}
      rel={disabled ? undefined : "noreferrer"}
      aria-disabled={disabled}
      className={`inline-flex h-8 w-full items-center justify-center gap-2 border-2 border-black text-[9px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${disabled ? "pointer-events-none bg-[#111827]/35 text-slate-500" : "bg-[#111827]/55 text-white backdrop-blur-[2px] hover:bg-[#162033]/65"}`}
    >
      <Download className="size-3" />
      直链下载
    </Link>
  );
}

export function ZenlessRightRail({
  game,
  mod,
}: {
  game: GameConfig;
  mod: SiteMod;
}) {
  const size = `${Math.max(128, Math.round(mod.downloads / 48))}.7 MB`;
  return (
    <aside className="space-y-2 xl:sticky xl:top-[82px] xl:-mt-8">
      <ZenlessDarkPanel title="About This Mod">
        <dl className="mt-2.5 space-y-1.5">
          <InfoRow label="Version" value={mod.version} />
          <InfoRow
            label="Updated"
            value={new Date(mod.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          />
          <InfoRow label="Category" value="Character Mods" />
          <InfoRow label="Size" value={size} />
          <InfoRow
            label="Downloads"
            value={compactZenlessNumber(mod.downloads)}
          />
          <InfoRow label="License" value={mod.nsfw ? "NSFW" : "Free"} />
          <InfoRow label="Game Version" value={mod.gameVersion} />
          <InfoRow label="Mod Loaders" value="WWMI, Wuthering Waves" />
        </dl>
      </ZenlessDarkPanel>
      <ZenlessDarkPanel title="Author">
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="relative size-10 overflow-hidden rounded-full border-[3px] border-black bg-[#0f172a] shadow-[2px_2px_0px_0px_#000]">
            <Image
              src={mod.coverImage}
              alt={mod.character}
              fill
              sizes="40px"
              className="object-cover"
              unoptimized={mod.coverImage?.includes("supabase.co")}
            />
          </div>
          <div>
            <p className="text-[13px] font-black leading-4 text-white">
              {mod.character} Creator
            </p>
            <p className="text-[10px] font-bold text-slate-400">Mod Creator</p>
          </div>
        </div>
        <div className="mt-2 flex gap-3 text-[10px] font-bold text-slate-400">
          <span>{mod.ratingCount} Mods</span>
          <span>{compactZenlessNumber(mod.favorites)} Followers</span>
        </div>
        <div className="mt-2.5 flex h-7 items-center justify-center border-2 border-black bg-[#111827]/50 text-[9px] font-black uppercase tracking-[0.12em] text-slate-100 shadow-[2px_2px_0px_0px_#000] backdrop-blur-[2px]">
          View Profile
        </div>
      </ZenlessDarkPanel>
      <ZenlessDarkPanel title="Requirements">
        <div className="mt-2.5 space-y-2 text-[10px] font-bold leading-4 text-slate-400">
          <div className="flex gap-2">
            <ShieldCheck className="size-3.5 shrink-0 text-slate-100" />
            <div>
              <p className="font-black text-white">{game.name}</p>
              <p>{mod.gameVersion} or higher</p>
            </div>
          </div>
          <div className="flex gap-2">
            <ShieldCheck className="size-3.5 shrink-0 text-slate-100" />
            <div>
              <p className="font-black text-white">WWMI or mod loader</p>
              <p>Latest version</p>
            </div>
          </div>
        </div>
      </ZenlessDarkPanel>
      <ZenlessDarkPanel title="Download File">
        <div className="mt-2.5 space-y-2">
          <div className="text-[10px] font-bold leading-4 text-slate-400">
            <p className="line-clamp-1 font-black text-white">
              {mod.title.replaceAll(" ", "_")}_v{mod.version}.zip
            </p>
            <p>{size}</p>
          </div>
          <RailDownloadButton downloadUrl={mod.downloadUrl} />
          <a
            href="#installation"
            className="inline-flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#111827]/50 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0px_0px_#000] backdrop-blur-[2px] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Manual Installation Guide <FileArchive className="size-3" />
          </a>
        </div>
      </ZenlessDarkPanel>
    </aside>
  );
}

export function ZenlessScreenshots({ mod }: { mod: SiteMod }) {
  return (
    <section id="mod-gallery" className="mt-6 scroll-mt-24">
      <h2 className="inline-flex border-2 border-black bg-[#07111f]/45 px-2 py-0.5 text-xs font-black uppercase tracking-[0.16em] text-slate-100 shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px]">
        Screenshots
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {getZenlessGallery(mod).map((image, index) => (
          <a
            key={`${image}-${index}`}
            href={image}
            target="_blank"
            rel="noreferrer"
            className={`relative h-[74px] overflow-hidden border-4 border-black bg-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 ${index === 2 ? "rotate-1" : index % 2 === 0 ? "-rotate-1" : "rotate-0"}`}
          >
            <Image
              src={image}
              alt={`${mod.title} screenshot ${index + 1}`}
              fill
              sizes="(max-width: 768px) 45vw, 150px"
              className="object-cover"
              unoptimized={image?.includes("supabase.co")}
            />
          </a>
        ))}
      </div>
    </section>
  );
}

export function ZenlessSignals({
  loggedIn,
  mod,
}: {
  loggedIn: boolean;
  mod: SiteMod;
}) {
  return (
    <div className="space-y-6">
      <RatingPanel
        modId={mod.id}
        isLoggedIn={loggedIn}
        ratingAverage={mod.ratingAverage}
        ratingCount={mod.ratingCount}
        userRating={mod.userRating ?? null}
      />
      <ZenlessDarkPanel title="Community Signals">
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="border-2 border-black bg-[#0b1220]/45 p-3 text-slate-100 shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px]">
            <Eye className="mb-2 size-4 text-slate-300" />
            <p className="font-black text-white">
              {compactZenlessNumber(mod.views)}
            </p>
            <p className="text-[11px] font-bold text-slate-400">Views</p>
          </div>
          <div className="border-2 border-black bg-[#111827]/45 p-3 text-slate-100 shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px]">
            <Heart className="mb-2 size-4 text-slate-300" />
            <p className="font-black text-white">
              {compactZenlessNumber(mod.favorites)}
            </p>
            <p className="text-[11px] font-bold text-slate-400">Favorites</p>
          </div>
          <div className="border-2 border-black bg-[#0f172a]/45 p-3 text-slate-100 shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px]">
            <ThumbsUp className="mb-2 size-4 text-slate-300" />
            <p className="font-black text-white">
              {compactZenlessNumber(mod.likes)}
            </p>
            <p className="text-[11px] font-bold text-slate-400">Likes</p>
          </div>
          <div className="border-2 border-black bg-[#102033]/45 p-3 text-slate-100 shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px]">
            <UserRound className="mb-2 size-4 text-slate-300" />
            <p className="font-black text-white">
              {compactZenlessNumber(mod.ratingCount)}
            </p>
            <p className="text-[11px] font-bold text-slate-400">Ratings</p>
          </div>
        </div>
      </ZenlessDarkPanel>
    </div>
  );
}

export function ZenlessRecommended({
  game,
  mods,
}: {
  game: GameConfig;
  mods: SiteMod[];
}) {
  if (!mods.length)
    return (
      <div className="border-4 border-black bg-[#07111f]/72 p-5 text-sm font-bold text-slate-300 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 backdrop-blur-[2px]">
        暂无推荐 MOD。
      </div>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {mods.map((item) => (
        <ModCard
          key={item.id}
          mod={item}
          href={`${game.nav.mods}/${item.id}`}
          variant="list"
          className="border-4 border-black bg-[#07111f]/72 p-2 text-slate-100 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 backdrop-blur-[2px]"
          mediaClassName="border-2 border-black shadow-none"
          imageAspectClassName="aspect-[16/10] min-h-0"
          showDescription={false}
          showInteractionBar={false}
          showMetaBadges={false}
          showRatingSticker={false}
          contentClassName="absolute inset-x-0 bottom-0 px-3 pb-3 pt-16 text-white"
        />
      ))}
    </div>
  );
}
