"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Eye, Heart, Share2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { reportView } from "@/lib/engagement/client";
import { useEngagement } from "@/lib/engagement/use-engagement";
import { buildModShareUrl } from "@/lib/mod-share";
import type { SiteMod } from "@/lib/mods";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

import { CommentsPanel } from "./comments-panel";
import { DownloadButton } from "./download-button";
import { DrawerPreviewGallery } from "./drawer-preview-gallery";
import { FavoriteButton } from "./favorite-button";
import { ShareModDialog, SHARE_BUTTON_CLASS } from "./share-mod-dialog";

type ModDetailDrawerProps = {
  admin?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  isLoggedIn?: boolean;
  modId: string;
  onClose?: () => void;
};

type DrawerTab = "overview" | "comments";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "overview", label: "总览" },
  { id: "comments", label: "评论" },
];

function SectionHeading({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-[3px] flex-1 bg-black" />
      <span className="text-sm font-black uppercase tracking-[0.16em] text-black/60">{children}</span>
      {extra}
      <span className="h-[3px] flex-1 bg-black" />
    </div>
  );
}

function ModDetailDrawerSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-1.5">
        <div className="h-5 w-14 animate-pulse border-[3px] border-black bg-white" />
        <div className="h-5 w-14 animate-pulse border-[3px] border-black bg-white" />
        <div className="h-5 w-20 animate-pulse border-[3px] border-black bg-white" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 flex-1 animate-pulse border-4 border-black bg-white" />
        ))}
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-32 w-24 shrink-0 animate-pulse border-4 border-black bg-white" />
        ))}
      </div>
      <div className="h-10 animate-pulse border-4 border-black bg-white" />
    </div>
  );
}

export function ModDetailDrawer({
  admin = false,
  currentUserId,
  currentUserName = "我",
  isLoggedIn = false,
  modId,
  onClose,
}: ModDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  const [descExpanded, setDescExpanded] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  /**
   * 当前展示第几张预览图。**抽屉与灯箱共用这一份状态**：
   * 灯箱里左右翻页后再关闭，抽屉顶部画廊停在同一张，而不是跳回第一张。
   */
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  // 打开抽屉时记录一次浏览（设备 + 日期的去重在服务端，重复打开不会重复计数）
  useEffect(() => {
    if (!modId) return;
    reportView(modId);
  }, [modId]);

  const {
    data: mod,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["mod-detail", modId],
    queryFn: async () => {
      const response = await fetch(`/api/mods/${modId}`);
      if (!response.ok) {
        throw new Error(response.status === 404 ? "not_found" : "fetch_error");
      }
      return response.json() as Promise<SiteMod>;
    },
    enabled: !!modId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  /**
   * 分享链接用规范域名，不用 `window.location.origin`：旧域名 wave-mod.top 现在是 410，
   * 从那边打开页面复制出去的链接对方会打不开（memory: wavemod-site-shutdown-410）。
   */
  const shareUrl = mod ? buildModShareUrl(getSiteUrl(), mod.id) : "";

  /**
   * 统计行里的浏览 / 收藏。
   *
   * 抽屉是默认分站（主站）真正的详情视图 —— `/mods/<id>` 其实渲染的是列表页外壳，
   * 详情由它按 id 拉 `/api/mods/[id]` 填进来。而那个接口的计数源头是 Supabase 快照，
   * 互动写入早已不再进 Supabase ⇒ 直接渲染 `mod.*` 会永远停在基线。
   */
  const { counts } = useEngagement(modId, {
    likes: mod?.likes ?? 0,
    favorites: mod?.favorites ?? 0,
    views: mod?.views ?? 0,
  });

  // 引用必须稳定：分享面板的焦点管理 effect 依赖它，换引用会让面板每渲染都抢一次焦点
  const closeShare = useCallback(() => setShareOpen(false), []);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // 面板是 portal 到 body 的，抽屉开始退场时若还开着就会盖在列表上
      setShareOpen(false);
      // 与 Sheet 的退场时长（300ms）对齐，动画播完再卸载
      setTimeout(() => onClose?.(), 300);
    }
  };

  // Lightbox open/close with animation
  const openLightbox = useCallback((index: number) => {
    setPreviewIndex(index);
    setLightboxOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setLightboxVisible(true));
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxVisible(false);
    setTimeout(() => setLightboxOpen(false), 200);
  }, []);

  const lightboxPrev = useCallback(() => {
    if (mod && mod.images.length > 0) {
      setPreviewIndex((prev) => (prev - 1 + mod.images.length) % mod.images.length);
    }
  }, [mod]);

  const lightboxNext = useCallback(() => {
    if (mod && mod.images.length > 0) {
      setPreviewIndex((prev) => (prev + 1) % mod.images.length);
    }
  }, [mod]);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lightboxPrev();
      if (e.key === "ArrowRight") lightboxNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, closeLightbox, lightboxPrev, lightboxNext]);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        overlayClassName="bg-black/5"
        showCloseButton={false}
        customWidth
        className="flex w-full flex-col bg-[#fff8ef] p-0 text-black sm:w-[45%]"
      >
        {/* Fixed top bar: title + close */}
        <div className="flex shrink-0 items-center justify-between border-b-4 border-black px-4 py-3">
          <h2 className="truncate text-2xl font-black uppercase tracking-[0.04em]">
            {isLoading ? "加载中..." : mod?.title ?? "外观资源详情"}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              // 还没有 id 就拼不出分享链接；此时二维码只能是空码
              disabled={!mod || isLoading}
              className={cn(SHARE_BUTTON_CLASS, "disabled:cursor-not-allowed disabled:opacity-40")}
              aria-label="分享这个资源"
              title="分享"
            >
              <Share2 className="size-4" strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              aria-label="关闭抽屉"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Fixed tab bar */}
        <div className="flex shrink-0 border-b-4 border-black">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition",
                activeTab === tab.id
                  ? "bg-[#ffd84f] text-black"
                  : "bg-white text-black/50 hover:bg-[#fff0cf] hover:text-black",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content: fills remaining height, scroll if needed */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {/* Loading */}
          {isLoading && <ModDetailDrawerSkeleton />}

          {/* Error */}
          {error && !isLoading && (
            <div className="flex flex-col items-center gap-4 p-8">
              <div className="w-full border-4 border-black bg-[#ffb5c3] px-5 py-4 text-center text-sm font-black shadow-[6px_6px_0px_0px_#000]">
                {error.message === "not_found"
                  ? "该外观资源不存在或已被删除。"
                  : "外观资源加载失败，请稍后重试。"}
              </div>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[3px_3px_0px_0px_#000]"
              >
                关闭
              </button>
            </div>
          )}

          {/* Overview tab */}
          {mod && activeTab === "overview" && (
            <div data-slot="drawer-overview-content" className="space-y-4 px-7 py-5 sm:px-8">
              {/* ── 标签 ──
                  角色 / 版本 / 适配放在图片上方：先交代「这是什么角色的什么资源」，
                  再看大图。 */}
              <div data-slot="drawer-badges" className="flex flex-wrap gap-1.5">
                <Badge className="neo-sticker -rotate-1 bg-[#ff7a7a] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-black hover:bg-[#ff7a7a]">
                  {mod.character}
                </Badge>
                <Badge className="neo-sticker rotate-1 bg-[#ffd84f] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-black hover:bg-[#ffd84f]">
                  {mod.version}
                </Badge>
                <Badge className="neo-sticker bg-[#bcaeff] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-black hover:bg-[#bcaeff]">
                  适配 {mod.gameVersion}
                </Badge>
              </div>

              {/* ── 数据卡片 + 收藏按钮 ──
                  浏览 / 下载 / 收藏放在数据卡里，收藏按钮与数据卡同一行。 */}
              <div className="flex items-stretch gap-2">
                <div
                  data-slot="drawer-stats"
                  className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 border-4 border-black bg-white px-2 py-2 text-center text-[11px] font-black text-black shadow-[4px_4px_0px_0px_#000]"
                >
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3.5" />
                    {counts.views} 次浏览
                  </span>
                  <span aria-hidden className="text-black/30">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Download className="size-3.5" />
                    {mod.downloads} 次下载
                  </span>
                  <span aria-hidden className="text-black/30">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="size-3.5" />
                    {mod.favorites} 次收藏
                  </span>
                </div>

                <div
                  data-slot="drawer-favorite-action"
                  className="flex w-[112px] shrink-0 [&>button]:h-full"
                >
                  <FavoriteButton
                    compact
                    id={mod.id}
                    isFavorited={Boolean(mod.isFavorited)}
                    isLoggedIn={isLoggedIn}
                    nextPath={`/mods/${mod.id}`}
                    favoriteCount={mod.favorites}
                  />
                </div>
              </div>

              {/* ── 预览画廊 ──
                  单图展示 + 左右箭头，下方缩略图可点选。 */}
              <DrawerPreviewGallery
                images={mod.images ?? []}
                title={mod.title}
                index={previewIndex}
                onIndexChange={setPreviewIndex}
                onOpenImage={openLightbox}
              />

              {/* ── 下载方式 ── */}
              <SectionHeading
                extra={
                  <span className="shrink-0 border-[3px] border-black bg-[#ff7a7a] px-2 py-0.5 text-[10px] font-bold tracking-widest text-black shadow-[2px_2px_0px_0px_#000]">
                    解压码 x77syq
                  </span>
                }
              >
                下载方式
              </SectionHeading>

              <DownloadButton
                compact
                modId={mod.id}
                downloadUrl={mod.downloadUrl}
                downloadCount={mod.downloads}
                driveLinks={mod.driveLinks}
              />

              {/* ── 描述 ── */}
              {mod.description && (
                <>
                  <SectionHeading>描述</SectionHeading>
                  <div className="border-[3px] border-black bg-white p-3 shadow-[4px_4px_0px_0px_#000]">
                    <p
                      className={cn(
                        "text-xs font-bold leading-6 text-black/75",
                        !descExpanded && "line-clamp-3",
                      )}
                    >
                      {mod.description}
                    </p>
                    {mod.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-black/50 hover:text-black"
                      >
                        {descExpanded ? "收起" : "展开全部"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Comments tab */}
          {mod && activeTab === "comments" && (
            <div className="px-7 py-5 sm:px-8">
              <CommentsPanel
                admin={admin}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                initialComments={[]}
                isLoggedIn={isLoggedIn}
                modId={mod.id}
              />
            </div>
          )}
        </div>
      </SheetContent>

      {/* 分享面板：内部 portal 到 body —— 抽屉的 transform 会成为 fixed 子元素的定位块 */}
      <ShareModDialog
        open={shareOpen}
        onClose={closeShare}
        url={shareUrl}
        title={mod?.title}
        imageUrl={mod?.images[0] ?? mod?.coverImage}
      />

      {/* Lightbox: fullscreen image preview with dark blur overlay */}
      {lightboxOpen && mod && (
        <div
          className={cn(
            "fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200",
            lightboxVisible ? "opacity-100" : "opacity-0",
          )}
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-5 top-5 z-[135] inline-flex size-12 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-0.5"
            aria-label="关闭预览"
          >
            <X className="size-5" />
          </button>

          {/* Counter */}
          <div className="absolute left-5 top-5 z-[135] border-4 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
            {previewIndex + 1} / {mod.images.length}
          </div>

          {/* Prev / Next arrows */}
          {mod.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
                className="absolute left-5 top-1/2 z-[135] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-[calc(50%+2px)]"
                aria-label="上一张"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
                className="absolute right-5 top-1/2 z-[135] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-[calc(50%+2px)]"
                aria-label="下一张"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}

          {/* Image: centered, constrained to viewport */}
          <div
            className={cn(
              "z-[132] flex max-h-[85vh] max-w-[90vw] items-center justify-center transition duration-200",
              lightboxVisible ? "scale-100 opacity-100" : "scale-95 opacity-0",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mod.images[previewIndex] ?? mod.images[0]}
              alt={`${mod.title} 预览 ${previewIndex + 1}`}
              className="max-h-[85vh] max-w-[90vw] border-4 border-black object-contain shadow-[10px_10px_0px_0px_#000]"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
