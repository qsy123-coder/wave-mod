"use client";

import Image from "next/image";
import { useState, useCallback, useEffect } from "react";

import type { Chapter, TutorialImageResolved } from "../types";
import { TutorialLightbox } from "./tutorial-lightbox";

type TutorialChapterImagesProps = {
  chapter: Chapter;
  imageBasePath: string;
  onNextChapter?: () => void;
  autoOpenLightbox?: number | null;
  onAutoOpenDone?: () => void;
};

export function TutorialChapterImages({
  chapter,
  imageBasePath,
  onNextChapter,
  autoOpenLightbox,
  onAutoOpenDone,
}: TutorialChapterImagesProps) {
  const images = chapter.images ?? [];
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lastViewedIndex, setLastViewedIndex] = useState<number | null>(null);

  const resolvedImages: TutorialImageResolved[] = images.map((filename, i) => ({
    src: `${imageBasePath}${filename}`,
    alt: `章节 ${chapter.id} — 第 ${i + 1} 步`,
    chapterId: chapter.id,
    index: i,
  }));

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const STORAGE_KEY = "wavemod-tutorial-last-position";

  // Track last viewed index + persist to localStorage
  const handleIndexChange = useCallback((index: number) => {
    setLastViewedIndex(index);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ chapterId: chapter.id, imageIndex: index }),
      );
    } catch { /* ignore quota errors */ }
  }, [chapter.id]);

  // Auto-open lightbox at specified index (from "下一节" or resume)
  useEffect(() => {
    if (autoOpenLightbox != null && images.length > 0) {
      setLightboxIndex(autoOpenLightbox);
      setLightboxOpen(true);
      onAutoOpenDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenLightbox]);

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {resolvedImages.map((img, i) => {
          const isLastViewed = lastViewedIndex === i;

          return (
            <button
              key={img.src}
              type="button"
              onClick={() => openLightbox(i)}
              className="group relative cursor-zoom-in overflow-hidden border-4 bg-white shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
              style={
                isLastViewed
                  ? { borderColor: "var(--neo-accent)", boxShadow: "6px 6px 0px 0px var(--neo-accent)" }
                  : undefined
              }
            >
              {/* Step number badge — top-left */}
              <span className="absolute left-1.5 top-1.5 z-10 border-[3px] border-black bg-[var(--neo-accent)] px-1.5 py-0.5 font-black text-black shadow-[2px_2px_0px_0px_#000]">
                <span className="text-[10px] uppercase tracking-[0.1em]">
                  第 {i + 1} 步
                </span>
              </span>

              <Image
                src={img.src}
                alt={img.alt}
                width={800}
                height={0}
                className="h-auto w-full"
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                priority={i < 3}
              />
            </button>
          );
        })}
      </div>

      {lightboxOpen && (
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
