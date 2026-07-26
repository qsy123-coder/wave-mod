"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

import type { Chapter } from "../types";
import { TutorialNav } from "./tutorial-nav";
import { TutorialChapterText } from "./tutorial-chapter-text";
import { TutorialChapterImages } from "./tutorial-chapter-images";

type TutorialTabsProps = {
  chapters: Chapter[];
  imageBasePath: string;
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
 */
export function TutorialTabs({ chapters, imageBasePath }: TutorialTabsProps) {
  const [activeId, setActiveId] = useState(chapters[0]?.id ?? "00");
  // null = no auto-open; number = auto-open lightbox at this index
  const [autoOpenIndex, setAutoOpenIndex] = useState<number | null>(null);
  const [resumeTarget, setResumeTarget] = useState<SavedPosition | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  const activeChapter =
    chapters.find((ch) => ch.id === activeId) ?? chapters[0];

  // Read saved position on mount
  useEffect(() => {
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <TutorialNav
        chapters={chapters}
        activeId={activeId}
        onChange={handleChange}
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
      <div className="min-h-0 flex-1 overflow-y-auto pb-16 pt-6">
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
              <TutorialChapterText chapter={activeChapter} />
            ) : (
              <TutorialChapterImages
                key={activeChapter.id}
                chapter={activeChapter}
                imageBasePath={imageBasePath}
                onNextChapter={goNextChapter}
                autoOpenLightbox={autoOpenIndex}
                onAutoOpenDone={() => setAutoOpenIndex(null)}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}
