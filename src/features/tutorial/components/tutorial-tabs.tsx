"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Tv, X } from "lucide-react";

import type { Chapter } from "../types";
import { TutorialNav } from "./tutorial-nav";
import { TutorialChapterText } from "./tutorial-chapter-text";
import { TutorialChapterImages } from "./tutorial-chapter-images";
import { TutorialVideoLightbox } from "./tutorial-video-lightbox";

type TutorialTabsProps = {
  chapters: Chapter[];
  imageBasePath: string;
  // ── Admin edit props (all optional — omit for normal user mode) ──
  editable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onEditChapter?: (chapterId: string) => void;
  onDeleteChapter?: (chapterId: string) => void;
  onAddChapter?: () => void;
  onEditChapterVideo?: (chapterId: string) => void;
  onDeleteImage?: (chapterId: string, index: number) => void;
  onMoveImage?: (chapterId: string, index: number, direction: "up" | "down") => void;
  onUploadImage?: (chapterId: string, file: File) => Promise<void>;
  onUploadVideo?: (chapterId: string, file: File) => Promise<void>;
  onEditTextChapter?: (chapterId: string) => void;
};

const STORAGE_KEY = "wavemod-tutorial-last-position";

interface SavedPosition {
  chapterId: string;
  imageIndex: number;
}

/**
 * Client Component — manages active tab state.
 * Tab bar is always visible; only the content area below scrolls.
 * Shows a resume banner if a saved browsing position exists.
 * Video lightbox is rendered at this level to avoid stacking-context
 * traps from framer-motion's motion.section.
 */
export function TutorialTabs({
  chapters,
  imageBasePath,
  editable,
  onReorder,
  onEditChapter,
  onDeleteChapter,
  onAddChapter,
  onEditChapterVideo,
  onDeleteImage,
  onMoveImage,
  onUploadImage,
  onUploadVideo,
  onEditTextChapter,
}: TutorialTabsProps) {
  const [activeId, setActiveId] = useState(chapters[0]?.id ?? "00");
  const [autoOpenIndex, setAutoOpenIndex] = useState<number | null>(null);
  const [resumeTarget, setResumeTarget] = useState<SavedPosition | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // ── Video lightbox — state lives here so it renders outside motion.section ──
  const [videoLightboxChapter, setVideoLightboxChapter] = useState<Chapter | null>(null);

  const activeChapter =
    chapters.find((ch) => ch.id === activeId) ?? chapters[0];

  // Read saved position on mount
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved: SavedPosition = JSON.parse(raw);
          if (saved.chapterId && typeof saved.imageIndex === "number") {
            setResumeTarget(saved);
            setShowResumeBanner(true);
          }
        }
      } catch { /* ignore */ }
    });
  }, []);

  const handleChange = useCallback((id: string) => {
    setAutoOpenIndex(null);
    setActiveId(id);
  }, []);

  // Find the next chapter ID after the current one (for lightbox "下一节" button)
  const currentIndex = chapters.findIndex((ch) => ch.id === activeId);
  const nextChapter =
    currentIndex >= 0 && currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : null;
  const goNextChapter = nextChapter
    ? () => {
        setAutoOpenIndex(0);
        setActiveId(nextChapter.id);
      }
    : undefined;

  // Resume: jump to saved chapter + open lightbox at saved step
  const handleResume = useCallback(() => {
    if (!resumeTarget) return;
    setActiveId(resumeTarget.chapterId);
    setAutoOpenIndex(resumeTarget.imageIndex);
    setShowResumeBanner(false);
  }, [resumeTarget]);

  const handleDismissResume = useCallback(() => {
    setShowResumeBanner(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const resumeChapter = chapters.find((ch) => ch.id === resumeTarget?.chapterId);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tab bar — z-[140] stays above the video lightbox */}
      <TutorialNav
        chapters={chapters}
        activeId={activeId}
        onChange={handleChange}
        draggable={editable}
        onReorder={onReorder}
        onEditChapter={onEditChapter}
        onDeleteChapter={onDeleteChapter}
        onAddChapter={onAddChapter}
        onEditChapterVideo={onEditChapterVideo}
      />

      {/* Resume banner */}
      {showResumeBanner && resumeTarget && resumeChapter && (
        <div className="inline-flex items-center gap-4 border-4 border-black p-3 shadow-[4px_4px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
          <p className="shrink-0 text-sm font-bold text-black">
            上次浏览到
            <span className="font-black"> {resumeTarget.chapterId} 节</span>
            {" — "}
            <span className="font-black">第 {resumeTarget.imageIndex + 1} 步</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResume}
              className="inline-flex items-center gap-1.5 border-[3px] border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              继续浏览
              <ArrowRight className="size-3" />
            </button>
            <button
              type="button"
              onClick={handleDismissResume}
              className="inline-flex size-7 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              aria-label="关闭提示"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* Scrollable content area with fade transition */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-12 pt-6">
        <AnimatePresence mode="wait">
          <motion.section
            key={activeChapter.id}
            id={`chapter-${activeChapter.id}`}
            data-chapter-id={activeChapter.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {activeChapter.type === "text" ? (
              <TutorialChapterText
                chapter={activeChapter}
                editable={editable}
                onEditIntro={
                  editable && onEditTextChapter
                    ? () => onEditTextChapter(activeChapter.id)
                    : undefined
                }
                onEditTools={
                  editable && onEditTextChapter
                    ? () => onEditTextChapter(activeChapter.id)
                    : undefined
                }
                onUploadVideo={
                  editable && onUploadVideo
                    ? (file: File) => onUploadVideo(activeChapter.id, file)
                    : undefined
                }
                hasVideo={!!activeChapter.video}
              />
            ) : (
              <TutorialChapterImages
                key={activeChapter.id}
                chapter={activeChapter}
                imageBasePath={imageBasePath}
                onNextChapter={goNextChapter}
                autoOpenLightbox={autoOpenIndex}
                onAutoOpenDone={() => setAutoOpenIndex(null)}
                editable={editable}
                onDeleteImage={
                  editable && onDeleteImage
                    ? (index: number) => onDeleteImage(activeChapter.id, index)
                    : undefined
                }
                onMoveImage={
                  editable && onMoveImage
                    ? (index: number, direction: "up" | "down") =>
                        onMoveImage(activeChapter.id, index, direction)
                    : undefined
                }
                onUploadImage={
                  editable && onUploadImage
                    ? (file: File) => onUploadImage(activeChapter.id, file)
                    : undefined
                }
                onUploadVideo={
                  editable && onUploadVideo
                    ? (file: File) => onUploadVideo(activeChapter.id, file)
                    : undefined
                }
                hasVideo={!!activeChapter.video}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      {/* Floating video button — absolute positioned, doesn't consume layout space */}
      {activeChapter.video && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <button
            type="button"
            onClick={() => setVideoLightboxChapter(activeChapter)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-black/20 bg-white/70 px-8 py-4.5 text-lg font-bold text-black/70 shadow-sm backdrop-blur transition hover:bg-white/90 hover:text-black hover:shadow-md"
          >
            <Tv className="size-4" />
            观看该章节视频
          </button>
        </div>
      )}

      {/* Video lightbox — rendered OUTSIDE motion.section to avoid stacking-context trap */}
      {videoLightboxChapter?.video && (
        <TutorialVideoLightbox
          video={videoLightboxChapter.video}
          chapterId={videoLightboxChapter.id}
          chapterTitle={videoLightboxChapter.title}
          onClose={() => setVideoLightboxChapter(null)}
        />
      )}
    </div>
  );
}
