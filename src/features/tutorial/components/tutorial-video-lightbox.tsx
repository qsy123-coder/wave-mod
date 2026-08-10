"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { VideoConfig } from "../types";
import { TutorialVideoPlayer } from "./tutorial-video-player";

type TutorialVideoLightboxProps = {
  video: VideoConfig;
  chapterId: string;
  chapterTitle: string;
  onClose: () => void;
};

/**
 * Full-screen video lightbox — portalled to document.body to escape
 * the containing block created by framer-motion's transform on ancestor
 * MotionReveal / motion.section wrappers.
 *
 * Opens as an overlay when the user clicks "观看视频版", with a
 * semi-transparent backdrop so the page content remains visible underneath.
 */
export function TutorialVideoLightbox({
  video,
  chapterId,
  chapterTitle,
  onClose,
}: TutorialVideoLightboxProps) {
  // Portal target — only available on the client
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // ── Keyboard: Escape to close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Lock body scroll ──
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6 sm:p-12"
      onClick={(e) => {
        // Close when clicking the backdrop (not the video player)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Chapter info badge — top-left */}
      <div className="absolute left-5 top-5">
        <div
          className="border-4 border-black px-3 py-1.5 font-black tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          <span className="text-sm">{chapterId}</span>
          <span className="hidden text-xs sm:inline"> — {chapterTitle}</span>
        </div>
      </div>

      {/* Close button — top-right */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 inline-flex size-12 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        aria-label="关闭视频"
      >
        <X className="size-5" />
      </button>

      {/* Video player — larger on big screens */}
      <div className="w-full max-w-6xl">
        <TutorialVideoPlayer
          src={video.src}
          poster={video.poster}
          chapterId={chapterId}
          chapterTitle={chapterTitle}
          showBanner={false}
        />
      </div>
    </div>,
    document.body,
  );
}
