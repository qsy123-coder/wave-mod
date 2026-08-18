"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Heart, Star, ThumbsUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { SiteMod } from "@/lib/mods";
import { isExternalStorageUrl } from "@/lib/storage/shared";
import { cn } from "@/lib/utils";

import { CommentsPanel } from "./comments-panel";
import { DownloadButton } from "./download-button";
import { FavoriteButton } from "./favorite-button";
import { LikeButton } from "./like-button";
import { RatingPanel } from "./rating-panel";

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  // 打开抽屉时记录一次浏览
  useEffect(() => {
    if (!modId) return;
    fetch(`/api/mods/${modId}/view`, { method: "POST" }).catch(() => {
      // 静默失败，不影响用户体验
    });
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

  const safeRatingAverage = mod && Number.isFinite(mod.ratingAverage) ? mod.ratingAverage : 0;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => onClose?.(), 200);
    }
  };

  // Lightbox open/close with animation
  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setLightboxVisible(true));
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxVisible(false);
    setTimeout(() => setLightboxIndex(null), 200);
  }, []);

  const lightboxPrev = useCallback(() => {
    if (mod) {
      setLightboxIndex((prev) => (prev! - 1 + mod.images.length) % mod.images.length);
    }
  }, [mod]);

  const lightboxNext = useCallback(() => {
    if (mod) {
      setLightboxIndex((prev) => (prev! + 1) % mod.images.length);
    }
  }, [mod]);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lightboxPrev();
      if (e.key === "ArrowRight") lightboxNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, closeLightbox, lightboxPrev, lightboxNext]);

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
            {isLoading ? "加载中..." : mod?.title ?? "MOD 详情"}
          </h2>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            aria-label="关闭抽屉"
          >
            ✕
          </button>
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
                  ? "MOD 不存在或已被删除。"
                  : "MOD 信息加载失败，请稍后重试。"}
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
            <div className="space-y-3 p-3">
              {/* ── 基本信息 ── */}
              <SectionHeading>基本信息</SectionHeading>

              {/* Metadata badges */}
              <div className="flex flex-wrap gap-1.5">
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

              {/* Stats row: 4 items in one row */}
              <div className="grid grid-cols-4 gap-1.5">
                <div className="border-[3px] border-black bg-[#ffd84f] px-2 py-1.5 text-center shadow-[3px_3px_0px_0px_#000]">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/50">评分</p>
                  <p className="mt-0.5 inline-flex items-center justify-center gap-1 text-sm font-black">
                    <Star className="size-3 fill-[#ff7a00] text-[#ff7a00]" />
                    {safeRatingAverage.toFixed(1)}
                  </p>
                </div>
                <div className="border-[3px] border-black bg-[#fff0cf] px-2 py-1.5 text-center shadow-[3px_3px_0px_0px_#000]">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/50">浏览</p>
                  <p className="mt-0.5 inline-flex items-center justify-center gap-1 text-sm font-black">
                    <Eye className="size-3" />
                    {mod.views}
                  </p>
                </div>
                <div className="border-[3px] border-black bg-[#ff7a7a] px-2 py-1.5 text-center shadow-[3px_3px_0px_0px_#000]">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/50">点赞</p>
                  <p className="mt-0.5 inline-flex items-center justify-center gap-1 text-sm font-black">
                    <ThumbsUp className="size-3" />
                    {mod.likes}
                  </p>
                </div>
                <div className="border-[3px] border-black bg-[#bcaeff] px-2 py-1.5 text-center shadow-[3px_3px_0px_0px_#000]">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/50">收藏</p>
                  <p className="mt-0.5 inline-flex items-center justify-center gap-1 text-sm font-black">
                    <Heart className="size-3" />
                    {mod.favorites}
                  </p>
                </div>
              </div>

              {/* Action buttons: like + favorite */}
              <div className="grid grid-cols-2 gap-1.5">
                <FavoriteButton
                  compact
                  id={mod.id}
                  isFavorited={Boolean(mod.isFavorited)}
                  isLoggedIn={isLoggedIn}
                  nextPath={`/mods/${mod.id}`}
                  favoriteCount={mod.favorites}
                />
                <LikeButton
                  compact
                  modId={mod.id}
                  isLiked={Boolean(mod.isLiked)}
                  isLoggedIn={isLoggedIn}
                  likeCount={mod.likes}
                  nextPath={`/mods/${mod.id}`}
                />
              </div>

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

              {/* ── 预览 ── */}
              {mod.images.length > 0 && (
                <>
                  <SectionHeading>预览 ({mod.images.length})</SectionHeading>
                  <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "thin" }}>
                    {mod.images.map((src, index) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => openLightbox(index)}
                        className="shrink-0 cursor-zoom-in overflow-hidden border-[3px] border-black bg-white shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5"
                      >
                        <Image
                          src={src}
                          alt={`${mod.title} 预览 ${index + 1}`}
                          width={320}
                          height={0}
                          unoptimized={isExternalStorageUrl(src ?? "")}
                          sizes="320px"
                          className="h-auto max-h-72 w-auto max-w-[280px] object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}

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
            <div className="p-3">
              <RatingPanel
                modId={mod.id}
                isLoggedIn={isLoggedIn}
                ratingAverage={safeRatingAverage}
                ratingCount={mod.ratingCount}
                userRating={mod.userRating ?? null}
              />

              <div className="mt-3">
                <CommentsPanel
                  admin={admin}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  initialComments={[]}
                  isLoggedIn={isLoggedIn}
                  modId={mod.id}
                />
              </div>
            </div>
          )}
        </div>
      </SheetContent>

      {/* Lightbox: fullscreen image preview with dark blur overlay */}
      {lightboxIndex !== null && mod && (
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
            {lightboxIndex + 1} / {mod.images.length}
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
              src={mod.images[lightboxIndex]}
              alt={`${mod.title} 预览 ${lightboxIndex + 1}`}
              className="max-h-[85vh] max-w-[90vw] border-4 border-black object-contain shadow-[10px_10px_0px_0px_#000]"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
