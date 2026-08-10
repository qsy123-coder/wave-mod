"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Trash2, ChevronUp, ChevronDown, Upload, Video } from "lucide-react";
import type { Chapter, TutorialImageResolved } from "../types";
import { TutorialLightbox } from "./tutorial-lightbox";

type TutorialChapterImagesProps = {
  chapter: Chapter;
  imageBasePath: string;
  onNextChapter?: () => void;
  autoOpenLightbox?: number | null;
  onAutoOpenDone?: () => void;
  // ── Admin edit props (omit for normal mode) ──
  editable?: boolean;
  onDeleteImage?: (index: number) => void;
  onMoveImage?: (index: number, direction: "up" | "down") => void;
  onUploadImage?: (file: File) => Promise<void>;
  onUploadVideo?: (file: File) => Promise<void>;
  hasVideo?: boolean;
};

/** Single image card with skeleton placeholder + fade-in on load */
function TutorialImageCard({
  img,
  index,
  isLastViewed,
  priority,
  onClick,
  editable,
  onDelete,
  onMoveUp,
  onMoveDown,
  totalImages,
}: {
  img: TutorialImageResolved;
  index: number;
  isLastViewed: boolean;
  priority: boolean;
  onClick: () => void;
  editable?: boolean;
  onDelete?: (index: number) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  totalImages: number;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className="relative w-full cursor-zoom-in overflow-hidden border-4 bg-white shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
        style={
          isLastViewed
            ? { borderColor: "var(--neo-accent)", boxShadow: "6px 6px 0px 0px var(--neo-accent)" }
            : undefined
        }
      >
        {/* Skeleton placeholder */}
        {!loaded && (
          <div className="aspect-[4/3] w-full animate-pulse bg-gray-200" />
        )}

        {/* Step number badge */}
        <span
          className={`absolute left-1.5 top-1.5 z-10 border-[3px] border-black bg-[var(--neo-accent)] px-1.5 py-0.5 font-black text-black shadow-[2px_2px_0px_0px_#000] transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="text-[10px] uppercase tracking-[0.1em]">
            第 {index + 1} 步
          </span>
        </span>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.src}
          alt={img.alt}
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onLoad={() => {
            console.log("[tutorial-images] loaded:", img.src);
            setLoaded(true);
          }}
          onError={(e) => console.error("[tutorial-images] failed to load:", img.src, e)}
          className={`h-auto w-full transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </button>

      {/* Admin toolbar — always visible overlay */}
      {editable && loaded && (
        <div className="absolute -right-1 -top-1 z-20 flex items-center gap-0.5 rounded border border-black/20 bg-white/90 p-0.5 shadow-sm backdrop-blur">
          {onMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp(index);
              }}
              disabled={index === 0}
              className="rounded p-0.5 text-black/50 hover:bg-[var(--neo-accent)] hover:text-black disabled:opacity-25"
              aria-label="上移"
              title="上移"
            >
              <ChevronUp className="size-3" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown(index);
              }}
              disabled={index === totalImages - 1}
              className="rounded p-0.5 text-black/50 hover:bg-[var(--neo-accent)] hover:text-black disabled:opacity-25"
              aria-label="下移"
              title="下移"
            >
              <ChevronDown className="size-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(index);
              }}
              className="rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
              aria-label="删除图片"
              title="删除"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Upload placeholder card for admin mode */
function UploadPlaceholder({
  onUpload,
  uploading,
}: {
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1 border-4 border-dashed border-black/30 bg-white/50 transition hover:border-[var(--neo-accent)] hover:bg-[var(--neo-accent)]/10">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUpload(file);
            e.target.value = "";
          }
        }}
      />
      {uploading ? (
        <>
          <div className="size-6 animate-spin rounded-full border-2 border-black/30 border-t-black" />
          <span className="text-[10px] font-bold text-black/40">上传中...</span>
        </>
      ) : (
        <>
          <Upload className="size-5 text-black/30" />
          <span className="text-[10px] font-bold text-black/30">上传图片</span>
        </>
      )}
    </label>
  );
}

export function TutorialChapterImages({
  chapter,
  imageBasePath,
  onNextChapter,
  autoOpenLightbox,
  onAutoOpenDone,
  editable = false,
  onDeleteImage,
  onMoveImage,
  onUploadImage,
  onUploadVideo,
  hasVideo,
}: TutorialChapterImagesProps) {
  const images = chapter.images ?? [];
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lastViewedIndex, setLastViewedIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const resolvedImages: TutorialImageResolved[] = images.map((filename, i) => ({
    // Full COS URLs pass through directly; local filenames get the base path prefix
    src: filename.startsWith("http") ? filename : `${imageBasePath}${filename}`,
    alt: `章节 ${chapter.id} — 第 ${i + 1} 步`,
    chapterId: chapter.id,
    index: i,
  }));

  // ── Debug: log resolved image URLs ──
  useEffect(() => {
    console.log("[tutorial-images] chapter:", chapter.id, "imageBasePath:", imageBasePath, "images count:", images.length);
    resolvedImages.forEach((img, i) => console.log(`[tutorial-images]   [${i}] src: ${img.src}`));
  }, [chapter.id, imageBasePath, images.length, resolvedImages]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const STORAGE_KEY = "wavemod-tutorial-last-position";

  const handleIndexChange = useCallback((index: number) => {
    setLastViewedIndex(index);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ chapterId: chapter.id, imageIndex: index }),
      );
    } catch { /* ignore */ }
  }, [chapter.id]);

  useEffect(() => {
    if (autoOpenLightbox != null && images.length > 0) {
      setLightboxIndex(autoOpenLightbox);
      setLightboxOpen(true);
      onAutoOpenDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenLightbox]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!onUploadImage) return;
      setUploading(true);
      try {
        await onUploadImage(file);
      } finally {
        setUploading(false);
      }
    },
    [onUploadImage],
  );

  const handleVideoUpload = useCallback(
    async (file: File) => {
      if (!onUploadVideo) return;
      setUploadingVideo(true);
      try {
        await onUploadVideo(file);
      } finally {
        setUploadingVideo(false);
      }
    },
    [onUploadVideo],
  );

  if (images.length === 0 && !editable) {
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {resolvedImages.map((img, i) => (
          <TutorialImageCard
            key={`${img.chapterId}-${i}`}
            img={img}
            index={i}
            isLastViewed={lastViewedIndex === i}
            priority={i < 3}
            onClick={() => openLightbox(i)}
            editable={editable}
            onDelete={onDeleteImage}
            onMoveUp={onMoveImage ? () => onMoveImage(i, "up") : undefined}
            onMoveDown={onMoveImage ? () => onMoveImage(i, "down") : undefined}
            totalImages={resolvedImages.length}
          />
        ))}

        {/* Upload placeholder — only in admin mode */}
        {editable && onUploadImage && (
          <UploadPlaceholder onUpload={handleUpload} uploading={uploading} />
        )}

        {/* Empty state for admin mode */}
        {editable && images.length === 0 && !uploading && (
          <div className="col-span-full border-4 border-dashed border-black/30 p-8 text-center">
            <p className="text-sm font-bold text-black/40">暂无步骤图片，点击上方「上传图片」添加</p>
          </div>
        )}
      </div>

      {/* Video upload section — only in admin mode */}
      {editable && onUploadVideo && (
        <div className="border-t-4 border-black pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 border-[3px] border-black bg-white px-4 py-2 text-sm font-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-[var(--neo-secondary)]">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/x-matroska,video/quicktime"
                className="hidden"
                disabled={uploadingVideo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleVideoUpload(file);
                    e.target.value = "";
                  }
                }}
              />
              {uploadingVideo ? (
                <>
                  <div className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  <span>上传中...</span>
                </>
              ) : (
                <>
                  <Video className="size-4" />
                  <span>上传视频</span>
                </>
              )}
            </label>
            {hasVideo && (
              <span className="text-xs font-bold text-green-600">已有视频（重新上传会覆盖）</span>
            )}
            {!hasVideo && !uploadingVideo && (
              <span className="text-xs font-bold text-black/40">上传章节视频教程（MP4/WebM）</span>
            )}
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxOpen && resolvedImages.length > 0 && (
        <TutorialLightbox
          key={chapter.id}
          images={resolvedImages}
          initialIndex={lightboxIndex}
          onClose={closeLightbox}
          onNextChapter={onNextChapter}
          onIndexChange={handleIndexChange}
          chapterId={chapter.id}
          chapterTitle={chapter.title}
        />
      )}
    </>
  );
}
