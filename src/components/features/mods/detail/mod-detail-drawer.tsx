"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Share2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { reportView } from "@/lib/engagement/client";
import { isDownloadBaseFromZero } from "@/lib/engagement/downloads-policy";
import { useEngagement } from "@/lib/engagement/use-engagement";
import { buildModShareUrl } from "@/lib/mod-share";
import type { SiteMod } from "@/lib/mods";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

import { CommentsPanel } from "./comments-panel";
import { DownloadButton } from "./download-button";
import { DrawerPreviewGallery } from "./drawer-preview-gallery";
import { FavoriteButton } from "./favorite-button";
import { ShareModDialog } from "./share-mod-dialog";

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

/**
 * 「更新于 YYYY-MM-DD（N 天前）」。
 *
 * ⚠️ 库里**没有** `updated_at` 字段（见 SiteMod），这里用 `createdAt` —— 每日上传脚本把它
 * 固定设成当天 12:00（上海），所以对这批资源来说「入库日」就是它出现在站内的日期。
 * 按上海时区格式化，避免客户端时区不同导致日期差一天。
 */
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知";

  const ymd = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const relative = days <= 0 ? "今天" : days === 1 ? "1 天前" : `${days} 天前`;

  return `${ymd}（${relative}）`;
}

function ModDetailDrawerSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="h-8 w-3/4 animate-pulse border-[3px] border-black bg-white" />
      <div className="flex flex-wrap gap-1.5">
        <div className="h-6 w-14 animate-pulse border-[3px] border-black bg-white" />
        <div className="h-6 w-32 animate-pulse border-[3px] border-black bg-white" />
        <div className="h-6 w-24 animate-pulse border-[3px] border-black bg-white" />
      </div>
      <div className="aspect-[16/10] animate-pulse border-4 border-black bg-white" />
      <div className="h-16 animate-pulse border-4 border-black bg-white" />
      <div className="h-12 animate-pulse border-4 border-black bg-white" />
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
    // 基线来自快照里的历史下载数；点下载后由互动接口实时 +1（以前这里永远是快照值）
    downloads: mod?.downloads ?? 0,
  });

  /**
   * 统计行里显示的下载量。
   *
   * 2026-10-22 及以后发布的 mod 不再套「浏览量 × 65%」的历史基数，只显示真实点击
   * （`downloadsReal`，从 0 开始）；更早的 mod 保持原显示不动（用户明确要求不回改）。
   * 口径与日期见 @/lib/engagement/downloads-policy。
   */
  const displayDownloads = mod && isDownloadBaseFromZero(mod.createdAt) ? counts.downloadsReal : counts.downloads;

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
      {/*
       * 右侧抽屉：手机整屏，桌面 45% 宽。用户 2026-10-20 明确要求保留原来的弹出方式
       * （曾试过改成 720px 居中弹窗，已回退）。
       */}
      <SheetContent
        side="right"
        overlayClassName="bg-black/5"
        showCloseButton={false}
        customWidth
        className="flex w-full flex-col bg-[#fff8ef] p-0 text-black sm:w-[45%]"
      >
        {/* ── 顶栏：角色标签 + 关闭 ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-4 border-black px-3 py-2">
          {/* 参考图顶栏是黑底白字方块标签；这里用黄底黑字保持站内配色，形状改成直角方块 */}
          <span className="max-w-[70%] truncate border-[3px] border-black bg-[#ffd84f] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000]">
            {isLoading ? "加载中" : (mod?.character ?? "外观资源")}
          </span>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            aria-label="关闭抽屉"
          >
            ✕
          </button>
        </div>

        {/* ── 标签页 ── */}
        <div className="flex shrink-0 border-b-4 border-black">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] transition",
                activeTab === tab.id
                  ? "bg-[#ffd84f] text-black"
                  : "bg-white text-black/50 hover:bg-[#fff0cf] hover:text-black",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 内容区 ── */}
        {/* scrollbar-gutter: 预留滚动条槽位 —— 否则内容高度一变（切横竖预览图），
            滚动条出现/消失会让整块内容左右横移几像素，看起来像在抖 */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]" style={{ scrollbarWidth: "thin" }}>
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
            <div data-slot="drawer-overview-content" className="space-y-2.5 px-3 pb-4 pt-3 sm:px-5">
              {/* ── 标题 ── */}
              <h1
                data-slot="drawer-title"
                className="line-clamp-2 text-xl font-black leading-tight tracking-[0.01em] sm:text-2xl"
              >
                {mod.title}
              </h1>

              {/* ── 徽章行：每个网盘一张卡 + 更新时间 ── */}
              <div data-slot="drawer-badges" className="flex flex-wrap items-center gap-1.5">
                {(mod.driveLinks ?? []).map((drive) => (
                  <span
                    key={`${drive.platform}-${drive.url}`}
                    className="border-[3px] border-black bg-[#22D3EE] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000]"
                  >
                    {drive.platform}
                  </span>
                ))}
                <span className="border-[3px] border-black bg-white px-2.5 py-1 text-[11px] font-black tracking-[0.06em] text-black shadow-[2px_2px_0px_0px_#000]">
                  更新于 {formatUpdatedAt(mod.createdAt)}
                </span>
              </div>

              {/* ── 游戏版本 + 数据卡片（同一行，尺寸收紧） ── */}
              <div data-slot="drawer-meta-row" className="flex flex-wrap items-stretch gap-2">
                <div
                  data-slot="drawer-game-version"
                  className="min-w-[104px] flex-1 border-[3px] border-black bg-[#22D3EE] px-2 py-1 shadow-[3px_3px_0px_0px_#000]"
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/55">游戏版本</p>
                  <p className="text-[13px] font-black leading-tight">{mod.gameVersion || "未标注"}</p>
                </div>
                <div
                  data-slot="drawer-stats"
                  className="flex min-w-[132px] flex-1 items-center justify-center border-[3px] border-black bg-white px-2 py-1 text-center text-[10px] font-black leading-4 text-black shadow-[3px_3px_0px_0px_#000]"
                >
                  {counts.views} 次浏览 · {displayDownloads} 次下载
                </div>
              </div>

              {/* ── 预览画廊：横图铺满 / 竖图限高居中，画框始终满宽 ── */}
              <DrawerPreviewGallery
                images={mod.images ?? []}
                title={mod.title}
                index={previewIndex}
                onIndexChange={setPreviewIndex}
                onOpenImage={openLightbox}
              />

              {/* 简介只在**单图**时出现：多图时下面还有缩略图条，再塞简介就会顶出滚动条。
                  两行截断 + 紧凑字号，保证任何情况下都不撑高内容区。 */}
              {(mod.images?.length ?? 0) === 1 ? (
                <div
                  data-slot="drawer-description"
                  className="border-[3px] border-black bg-white px-2 py-1.5 shadow-[3px_3px_0px_0px_#000]"
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/55">简介</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-5 text-black/80">
                    {mod.description || "站长还没有填写简介。"}
                  </p>
                </div>
              ) : null}

            </div>
          )}

          {/* Comments tab */}
          {mod && activeTab === "comments" && (
            <div className="px-4 py-5 sm:px-6">
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

        {/* ── 底部操作条：分享 / 各网盘下载 / 收藏 ──
            固定在弹窗底部，不随内容滚动；下载按钮按用户要求统一收进这一行。 */}
        <div className="flex shrink-0 items-stretch gap-2 border-t-4 border-black bg-[#fff8ef] px-2.5 py-2">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!mod || isLoading}
            className={cn(
              // 分享按内容宽度收缩，把剩余宽度让给下载按钮（手机上一行要塞下 分享 + 各网盘 + 收藏）
              "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 border-4 border-black bg-black px-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <Share2 className="size-4" strokeWidth={3} />
            分享
          </button>
          {/* 下载按钮：每个网盘一个，全部排在「分享」右边 */}
          {mod ? (
            <DownloadButton
              layout="bar"
              modId={mod.id}
              downloadUrl={mod.downloadUrl}
              downloadCount={mod.downloads}
              driveLinks={mod.driveLinks}
              unzipCode="x77syq"
            />
          ) : null}
          <div className="flex w-[88px] shrink-0">
            {mod ? (
              <FavoriteButton
                compact
                id={mod.id}
                isFavorited={Boolean(mod.isFavorited)}
                isLoggedIn={isLoggedIn}
                nextPath={`/mods/${mod.id}`}
                favoriteCount={mod.favorites}
              />
            ) : null}
          </div>
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
