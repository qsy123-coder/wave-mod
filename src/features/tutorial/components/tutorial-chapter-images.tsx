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

/** Single image card with skeleton placeholder + fade-in on load */
function TutorialImageCard({
  img,
  index,
  isLastViewed,
  priority,
  onClick,
}: {
  img: TutorialImageResolved;
  index: number;
  isLastViewed: boolean;
  priority: boolean;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-zoom-in overflow-hidden border-4 bg-white shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#000]"
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

      <Image
        src={img.src}
        alt={img.alt}
        width={800}
        height={0}
        loading={priority ? undefined : "lazy"}
        onLoad={() => setLoaded(true)}
        className={`h-auto w-full transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        priority={priority}
      />
    </button>
  );
}

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

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {resolvedImages.map((img, i) => (
          <TutorialImageCard
            key={img.src}
            img={img}
            index={i}
            isLastViewed={lastViewedIndex === i}
            priority={i < 3}
            onClick={() => openLightbox(i)}
          />
        ))}
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
