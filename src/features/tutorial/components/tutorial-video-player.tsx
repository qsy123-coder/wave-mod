"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
} from "lucide-react";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { useVideoProgress } from "../hooks/use-video-progress";

type TutorialVideoPlayerProps = {
  src: string;
  poster?: string;
  chapterId: string;
  chapterTitle: string;
  onBackToImages?: () => void;
  showBanner?: boolean;
};

/** Formats seconds as MM:SS */
function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Custom video player styled with the Neo-brutalism design system.
 *
 * Features:
 * - Play/pause, seek, volume toggle, fullscreen
 * - Keyboard shortcuts: Space (play/pause), ← → (skip 5s), F (fullscreen)
 * - Progress reporting via onTimeUpdate callback (for localStorage persistence)
 * - Resume playback from savedTime
 */
export function TutorialVideoPlayer({
  src,
  poster,
  chapterId,
  chapterTitle,
  onBackToImages,
  showBanner = true,
}: TutorialVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Tracks latest currentTime so cleanup can save even after DOM detach */
  const lastTimeRef = useRef(0);

  // ── Video progress persistence ──
  const { savedTime, saveProgress } = useVideoProgress(chapterId);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasAppliedSaved, setHasAppliedSaved] = useState(false);

  // ── Apply saved time once when metadata is loaded ──
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    console.log(`[Player] savedTime effect: chapterId=${chapterId} savedTime=${savedTime} hasAppliedSaved=${hasAppliedSaved}`);

    const onLoaded = () => {
      console.log(`[Player] onLoaded: chapterId=${chapterId} savedTime=${savedTime} hasAppliedSaved=${hasAppliedSaved} duration=${el.duration} readyState=${el.readyState}`);
      if (
        !hasAppliedSaved &&
        savedTime != null &&
        savedTime > 0 &&
        Number.isFinite(el.duration)
      ) {
        const target = Math.min(savedTime, el.duration - 1);
        console.log(`[Player] applying savedTime: setting currentTime to ${target}`);
        el.currentTime = target;
        setHasAppliedSaved(true);
      }
      setDuration(el.duration);
    };

    el.addEventListener("loadedmetadata", onLoaded);
    // Also handle case where metadata already loaded before this effect
    if (el.readyState >= 1 && Number.isFinite(el.duration)) {
      console.log(`[Player] metadata already loaded, calling onLoaded directly`);
      onLoaded();
    }

    return () => el.removeEventListener("loadedmetadata", onLoaded);
  }, [savedTime, hasAppliedSaved, chapterId]);

  // ── Sync state from video events ──
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => {
      console.log(`[Player] event: play, currentTime=${el.currentTime}`);
      setPlaying(true);
    };
    const onPause = () => {
      console.log(`[Player] event: pause, currentTime=${el.currentTime}`);
      setPlaying(false);
    };
    const onEnded = () => {
      console.log(`[Player] event: ended`);
      setPlaying(false);
    };
    const onTimeUpdate = () => {
      lastTimeRef.current = el.currentTime;
      setCurrentTime(el.currentTime);
    };
    const onDurationChange = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDurationChange);

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDurationChange);
    };
  }, []);

  // ── Fullscreen change listener ──
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Progress saving every 5 seconds ──
  useEffect(() => {
    if (!playing) {
      console.log(`[Player] interval effect: NOT playing, skip`);
      return;
    }

    console.log(`[Player] interval effect: starting 5s save interval, chapterId=${chapterId}`);
    saveIntervalRef.current = setInterval(() => {
      const t = lastTimeRef.current;
      if (t > 0) {
        console.log(`[Player] interval tick: saving lastTimeRef=${t}`);
        saveProgress(t);
      }
    }, 5000);

    return () => {
      console.log(`[Player] interval effect cleanup: clearing interval`);
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    };
  }, [playing, saveProgress, chapterId]);

  // ── Actions ──
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      el.play().catch(() => {
        /* autoplay may be blocked */
      });
    } else {
      el.pause();
    }
  }, []);

  const skip = useCallback((delta: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta));
    setCurrentTime(el.currentTime);
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = videoRef.current;
      const bar = progressRef.current;
      if (!el || !bar || !Number.isFinite(duration)) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
      setCurrentTime(el.currentTime);
    },
    [duration],
  );

  // ── Keyboard shortcuts ──
  const shortcuts = useMemo(
    () => ({
      Space: (e: KeyboardEvent) => {
        // Don't toggle if user is focused on an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        togglePlay();
      },
      ArrowLeft: () => skip(-5),
      ArrowRight: () => skip(5),
      KeyF: () => toggleFullscreen(),
    }),
    [togglePlay, skip, toggleFullscreen],
  );

  useKeyboardShortcuts(shortcuts);

  // ── Progress bar ratio ──
  const progressRatio =
    Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0;

  // ── Cleanup on unmount: save final position ──
  // Uses lastTimeRef instead of videoRef.current because the video element
  // ref may already be detached when React runs cleanup effects.
  useEffect(() => {
    return () => {
      const t = lastTimeRef.current;
      console.log(`[Player] unmount cleanup: lastTimeRef=${t}`);
      if (t > 0) {
        console.log(`[Player] unmount cleanup: saving final position ${t}`);
        saveProgress(t);
      }
    };
    // Only run on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col border-4 border-black bg-black shadow-[6px_6px_0px_0px_#000]"
    >
      {/* Banner bar */}
      {showBanner && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{ background: "var(--neo-secondary)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase tracking-[0.12em] text-black">
              📺 视频教程 — {chapterId}
            </span>
            <span className="hidden text-xs font-bold text-black/70 sm:inline">
              {chapterTitle}
            </span>
          </div>
          {onBackToImages && (
            <button
              type="button"
              onClick={onBackToImages}
              className="inline-flex items-center gap-1.5 border-[3px] border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <ArrowLeft className="size-3" />
              返回图文版
            </button>
          )}
        </div>
      )}

      {/* Video element */}
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        onClick={togglePlay}
        className="w-full cursor-pointer bg-black"
      />

      {/* Controls bar */}
      <div
        className="flex items-center gap-2 border-t-4 border-black px-3 py-2"
        style={{ background: "var(--neo-panel)" }}
      >
        {/* Play / Pause */}
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex size-9 shrink-0 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          aria-label={playing ? "暂停" : "播放"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>

        {/* Progress bar */}
        <div
          ref={progressRef}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressRatio * 100)}
          aria-label="播放进度"
          tabIndex={0}
          onClick={handleProgressClick}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") skip(-5);
            if (e.key === "ArrowRight") skip(5);
          }}
          className="relative flex h-7 flex-1 cursor-pointer items-center"
        >
          {/* Track */}
          <div className="h-2 w-full border-[3px] border-black bg-white">
            {/* Progress fill */}
            <div
              className="h-full transition-[width] duration-150"
              style={{
                width: `${progressRatio * 100}%`,
                background: "var(--neo-accent)",
              }}
            />
          </div>
          {/* Thumb */}
          <div
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 border-[3px] border-black bg-white shadow-[2px_2px_0px_0px_#000]"
            style={{ left: `${progressRatio * 100}%` }}
          />
        </div>

        {/* Time */}
        <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.08em] text-black/80">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>

        {/* Mute toggle */}
        <button
          type="button"
          onClick={toggleMute}
          className="inline-flex size-9 shrink-0 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          aria-label={muted ? "取消静音" : "静音"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>

        {/* Fullscreen */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex size-9 shrink-0 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          aria-label={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
