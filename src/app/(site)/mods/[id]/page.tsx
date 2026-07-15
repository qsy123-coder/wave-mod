import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Copy, Heart, Sparkles, Star, ThumbsUp } from "lucide-react";

import { ModDetailSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, isAdminUser } from "@/lib/supabase/server";
import { getFeaturedMods, getModComments, getPublicModBaseById, getViewerModState } from "@/lib/mods";

import { CommentsPanel } from "@/components/features/mods/detail/comments-panel";
import { HeroSectionNav } from "@/components/features/mods/detail/hero-section-nav";
import { ModDetailLayoutShell } from "@/components/features/mods/detail/mod-detail-layout-shell";
import { ModPreviewGallery } from "@/components/features/mods/detail/mod-preview-gallery";
import { ModViewTracker } from "@/components/features/mods/detail/mod-view-tracker";
import { RightSummaryDownloadTrigger } from "@/components/features/mods/detail/right-summary-download-trigger";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function ModDetailContent({ params }: PageProps) {
  const { id } = await params;
  const [baseMod, viewerState, user, comments, admin, hotMods] = await Promise.all([
    getPublicModBaseById(id),
    getViewerModState(id),
    getCurrentUser(),
    getModComments(id),
    isAdminUser(),
    getFeaturedMods(12),
  ]);

  if (!baseMod) notFound();

  const mod = {
    ...baseMod,
    ...viewerState,
  };
  const recommendedMods = hotMods.filter((item) => item.id !== mod.id);

  return (
    <ModDetailLayoutShell
      recommendedMods={recommendedMods}
      priorityCharacter={mod.character}
      actionPanel={{
        downloadUrl: mod.downloadUrl,
        downloads: mod.downloads,
        driveLinks: mod.driveLinks,
        isFavorited: Boolean(mod.isFavorited),
        isLiked: Boolean(mod.isLiked),
        isLoggedIn: Boolean(user),
        likes: mod.likes,
        modId: mod.id,
        nextPath: `/mods/${mod.id}`,
        ratingAverage: mod.ratingAverage,
        ratingCount: mod.ratingCount,
        title: mod.title,
        userRating: mod.userRating ?? null,
      }}
    >
      <ModViewTracker modId={mod.id} />
      <MotionReveal delay={0.02} rotate={-1}>
        <div className="inline-flex flex-wrap items-center gap-2 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[6px_6px_0px_0px_#000]">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/mods">MOD 分类</Link>
          <span>/</span>
          <span>{mod.title}</span>
        </div>
      </MotionReveal>

      <div className="grid gap-4">
        <div className="flex flex-nowrap items-center justify-between gap-3 overflow-x-auto pb-1">
          <MotionReveal delay={0.06} y={18} rotate={-1}>
            <div className="inline-flex shrink-0 flex-nowrap gap-2">
              <Badge className="neo-sticker -rotate-2 bg-[#ff7a7a] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[#ff7a7a]">{mod.character}</Badge>
              <Badge className="neo-sticker rotate-2 bg-[#ffd84f] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[#ffd84f]">{mod.version}</Badge>
              <Badge className="neo-sticker bg-[#bcaeff] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[#bcaeff]">适配 {mod.gameVersion}</Badge>
              {mod.nsfw ? <Badge className="neo-sticker bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-white">NSFW</Badge> : null}
            </div>
          </MotionReveal>

          <MotionReveal delay={0.08} y={18} rotate={1}>
            <div className="shrink-0">
              <HeroSectionNav compact />
            </div>
          </MotionReveal>
        </div>

        <div id="mod-gallery" className="grid scroll-mt-24 gap-6 xl:grid-cols-[minmax(0,1fr)_372px] xl:items-start">
          <MotionReveal delay={0.08} y={24} rotate={-1}>
            <ModPreviewGallery images={mod.images} title={mod.title} videoUrl={mod.videoUrl} />
          </MotionReveal>

          <aside className="relative min-w-0">
            <MotionReveal delay={0.12} y={24} rotate={1}>
              <div className="neo-card-lg bg-[#fff8ef] p-4 text-black">
                <div className="flex h-full flex-col gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 border-4 border-black bg-[#ffd84f] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] shadow-[4px_4px_0px_0px_#000]">
                      <Sparkles className="size-3.5" />Hero Summary
                    </div>
                    <h1 className="mt-3 text-3xl font-black leading-tight md:text-4xl">{mod.title}</h1>
                    <p className="mt-3 line-clamp-4 text-sm font-bold leading-7 text-black/75">{mod.description}</p>
                  </div>

                  <RightSummaryDownloadTrigger className="inline-flex h-12 w-full items-center justify-center gap-2 border-4 border-black bg-[#FFD93D] px-4 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" />
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-2">
                    <div className="border-4 border-black bg-[#ffd84f] p-3 shadow-[5px_5px_0px_0px_#000]">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">当前评分</p>
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black"><Star className="size-4 fill-[#ff7a00] text-[#ff7a00]" />{mod.ratingAverage.toFixed(1)}</p>
                    </div>
                    <div className="border-4 border-black bg-[#fff0cf] p-3 shadow-[5px_5px_0px_0px_#000]">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">下载量</p>
                      <p className="mt-1.5 text-xl font-black">{mod.downloads}</p>
                    </div>
                    <div className="border-4 border-black bg-[#ff7a7a] p-3 shadow-[5px_5px_0px_0px_#000]">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">点赞量</p>
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black"><ThumbsUp className="size-4" />{mod.likes}</p>
                    </div>
                    <div className="border-4 border-black bg-[#bcaeff] p-3 shadow-[5px_5px_0px_0px_#000]">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">收藏量</p>
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black"><Heart className="size-4" />{mod.favorites}</p>
                    </div>
                  </div>

                  <div className="border-4 border-black bg-white p-3 shadow-[5px_5px_0px_0px_#000]">
                    <div className="grid gap-2 text-[11px] font-black leading-6 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-3 sm:col-span-2"><span>浏览量</span><span>{mod.views}</span></div>
                    </div>
                  </div>

                  <div className="border-4 border-black bg-[#bcaeff] p-4 shadow-[6px_6px_0px_0px_#000]">
                    <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-black"><Copy className="size-3.5" />使用说明</p>
                    <p className="mt-2 text-sm font-bold leading-6 text-black/80">下载入口已移到右侧摘要区；左侧 dock 继续保留收藏、点赞和评分等核心操作。</p>
                  </div>
                </div>
              </div>
            </MotionReveal>
          </aside>
        </div>
      </div>

      <section id="mod-details" className="mt-8 scroll-mt-24 space-y-8">
        <div className="min-w-0 space-y-8">
          <MotionReveal delay={0.16} y={24} rotate={-1}>
            <section className="neo-card-lg bg-[#fff8ef] p-6 text-black">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="neo-label text-black/60">MOD Overview</p>
                  <h2 className="mt-2 text-3xl font-black">详情说明</h2>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-5">
                  <div className="border-4 border-black bg-white p-5 shadow-[6px_6px_0px_0px_#000]">
                    <p className="text-sm font-black uppercase tracking-[0.14em]">内容简介</p>
                    <p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-8 text-black/80">{mod.description}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="border-4 border-black bg-[#ffd84f] p-5 shadow-[6px_6px_0px_0px_#000]">
                    <p className="neo-label text-black/60">Quick Facts</p>
                    <dl className="mt-4 space-y-3 text-sm font-black leading-7">
                      <div className="flex items-center justify-between gap-4 border-b-2 border-black/15 pb-2"><dt>角色</dt><dd>{mod.character}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b-2 border-black/15 pb-2"><dt>版本</dt><dd>{mod.version}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b-2 border-black/15 pb-2"><dt>适配</dt><dd>{mod.gameVersion}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt>内容等级</dt><dd>{mod.nsfw ? "NSFW" : "普通"}</dd></div>
                    </dl>
                  </div>
                </div>
              </div>
            </section>
          </MotionReveal>

          <div id="mod-comments" className="scroll-mt-24">
            <CommentsPanel
              admin={Boolean(admin)}
              currentUserId={user?.id}
              currentUserName={user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "我"}
              initialComments={comments}
              isLoggedIn={Boolean(user)}
              modId={mod.id}
            />
          </div>
        </div>
      </section>
    </ModDetailLayoutShell>
  );
}

export default function ModDetailPage({ params }: PageProps) {
  return <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"><Suspense fallback={<ModDetailSkeleton />}><ModDetailContent params={params} /></Suspense></div>;
}
