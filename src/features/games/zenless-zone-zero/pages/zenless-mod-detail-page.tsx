import Image from "next/image";
import Link from "next/link";
import { Download, MessageSquare, Star } from "lucide-react";

import { CommentsPanel } from "@/components/features/mods/detail/comments-panel";
import { ModViewTracker } from "@/components/features/mods/detail/mod-view-tracker";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import type { GameConfig } from "@/config/games";
import type { ModComment, SiteMod } from "@/lib/mods";
import { ZenlessModDetailTabs } from "../components/zenless-mod-detail-tabs";
import {
  ZenlessHeroActions,
  ZenlessRecommended,
  ZenlessRightRail,
  ZenlessScreenshots,
  ZenlessSignals,
  compactZenlessNumber,
} from "../components/zenless-mod-detail-parts";

type ViewerUser = {
  email?: string;
  id?: string;
  user_metadata?: { display_name?: string };
} | null;

type ZenlessModDetailPageProps = {
  admin: boolean;
  comments: ModComment[];
  game: GameConfig;
  mod: SiteMod;
  recommendedMods: SiteMod[];
  user: ViewerUser;
};

export function ZenlessModDetailPage({
  admin,
  comments,
  game,
  mod,
  recommendedMods,
  user,
}: ZenlessModDetailPageProps) {
  const detailPath = `${game.nav.mods}/${mod.id}`;
  const loggedIn = Boolean(user);
  const installGuide =
    mod.xxmiInstallGuide.trim() ||
    "解压 ZIP 后，将文件夹放入 WWMI 的 Mods 目录，在加载器中启用该 MOD 后启动游戏。";
  const userName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "我";

  return (
    <main className="relative -mt-[74px] min-h-screen overflow-hidden bg-[#04070d] text-white">
      <ModViewTracker modId={mod.id} />
      <div className="absolute inset-0">
        <Image
          src="/bg-zzz/zzz-detail-bg.png"
          alt="Zenless Zone Zero city background"
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="object-cover object-[center_20%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,7,13,0.86)_0%,rgba(4,7,13,0.56)_35%,rgba(4,7,13,0.22)_58%,rgba(4,7,13,0.78)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[42vh] bg-gradient-to-t from-[#04070d]/72 via-[#04070d]/42 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#04070d] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-[1500px] gap-5 px-5 pb-8 pt-[92px] lg:px-8 xl:grid-cols-[minmax(0,1fr)_286px] xl:pt-[86px]">
        <div className="min-w-0">
          <MotionReveal delay={0.02} y={18}>
            <nav className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-400">
              <Link href={game.nav.home}>Home</Link>
              <span>›</span>
              <Link href={game.nav.mods}>Character Mods</Link>
              <span>›</span>
              <span className="text-slate-300">{mod.title}</span>
            </nav>
          </MotionReveal>

          <section className="grid min-h-[350px] content-end pt-7 lg:max-w-[720px]">
            <MotionReveal delay={0.06} y={24}>
              <Badge className="border-2 border-black bg-[#07111f]/78 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-100 shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px] hover:bg-[#07111f]/78">
                Character Mod
              </Badge>
              <h1 className="mt-3 max-w-[620px] text-4xl font-black uppercase leading-[1.04] tracking-[0.02em] text-slate-100 [text-shadow:4px_4px_0_#000] sm:text-5xl lg:text-[3.35rem]">
                {mod.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                <span>
                  By{" "}
                  <strong className="text-white">
                    {mod.character} Creator
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-white" />
                  {mod.ratingAverage.toFixed(1)}
                </span>
                <a href="#comments" className="inline-flex items-center gap-1">
                  <MessageSquare className="size-4" />
                  {mod.commentsCount} Comments
                </a>
                <span className="inline-flex items-center gap-1">
                  <Download className="size-4" />
                  {compactZenlessNumber(mod.downloads)}
                </span>
              </div>
              <p className="mt-3 max-w-xl line-clamp-2 text-sm font-medium leading-6 text-slate-300">
                {mod.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[mod.character, "Character", ...mod.tags]
                  .slice(0, 6)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="border-2 border-black bg-[#0f172a]/78 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-100 shadow-[2px_2px_0px_0px_#000] backdrop-blur-[2px]"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
              <div className="mt-4">
                <ZenlessHeroActions
                  mod={mod}
                  detailPath={detailPath}
                  loggedIn={loggedIn}
                />
              </div>
            </MotionReveal>
          </section>

          <ZenlessScreenshots mod={mod} />
          <ZenlessModDetailTabs
            commentsCount={mod.commentsCount}
            recommendedCount={recommendedMods.length}
            description={
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="border-4 border-black bg-[#07111f]/18 p-4 text-sm font-bold leading-7 text-slate-200 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10">
                  <p className="whitespace-pre-wrap">{mod.description}</p>
                  <ul className="mt-4 list-inside list-disc space-y-1 text-slate-400">
                    <li>Replaces default outfit</li>
                    <li>High-quality textures and materials</li>
                    <li>Custom visual effects for showcase screenshots</li>
                    <li>Physically based rendering friendly assets</li>
                  </ul>
                </div>
                <figure className="hidden items-center justify-center border-4 border-black bg-[#0f172a]/18 p-4 text-center text-slate-100 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 lg:flex">
                  <blockquote className="max-w-xs font-serif text-xl italic leading-8">
                    <span className="text-4xl text-white/25">“</span>In the
                    tides of night,
                    <br />
                    she dances with eternity.
                    <span className="text-4xl text-white/25">”</span>
                    <figcaption className="mt-2 text-xs not-italic text-slate-400">
                      — {mod.character} Creator
                    </figcaption>
                  </blockquote>
                </figure>
              </div>
            }
            installation={
              <section className="border-4 border-black bg-[#07111f]/20 p-4 text-sm font-bold leading-7 text-slate-200 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10">
                <h3 className="inline-flex border-2 border-black bg-[#111827]/55 px-2 py-0.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[2px_2px_0px_0px_#000] backdrop-blur-[2px]">
                  Installation
                </h3>
                <p className="mt-3 whitespace-pre-wrap">{installGuide}</p>
              </section>
            }
            changelog={
              <section className="border-4 border-black bg-[#111827]/20 p-4 text-sm font-bold leading-7 text-slate-100 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10">
                <h3 className="inline-flex border-2 border-black bg-[#0f172a]/55 px-2 py-0.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[2px_2px_0px_0px_#000] backdrop-blur-[2px]">
                  Changelog
                </h3>
                <p className="mt-3">
                  v{mod.version} · Initial public release for {mod.gameVersion}.
                </p>
              </section>
            }
            comments={
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div
                  id="mod-comments"
                  className="scroll-mt-24 border-4 border-black bg-[#07111f]/20 p-2 text-slate-100 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 [&_[data-comments-panel]]:border-0 [&_[data-comments-panel]]:bg-transparent [&_[data-comments-panel]]:text-slate-100 [&_[data-comments-panel]]:shadow-none"
                >
                  <CommentsPanel
                    admin={admin}
                    currentUserId={user?.id}
                    currentUserName={userName}
                    initialComments={comments}
                    isLoggedIn={loggedIn}
                    modId={mod.id}
                  />
                </div>
                <ZenlessSignals mod={mod} loggedIn={loggedIn} />
              </div>
            }
            recommended={
              <ZenlessRecommended game={game} mods={recommendedMods} />
            }
          />
        </div>
        <ZenlessRightRail game={game} mod={mod} />
      </div>
    </main>
  );
}
