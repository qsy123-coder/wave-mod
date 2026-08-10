"use client";

import { useMemo, useCallback } from "react";

const KEY_PREFIX = "wavemod-video-";

function getStorageKey(chapterId: string): string {
  return `${KEY_PREFIX}${chapterId}`;
}

/**
 * Reads a saved video playback position from localStorage.
 * Returns `undefined` if no position is saved or the value is invalid.
 */
function readSavedTime(chapterId: string): number | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem(getStorageKey(chapterId));
    console.log(`[useVideoProgress] read chapter=${chapterId} raw="${raw}"`);
    if (raw == null) return undefined;
    const parsed = Number(raw);
    const ok = Number.isFinite(parsed) && parsed > 0;
    console.log(`[useVideoProgress] read chapter=${chapterId} parsed=${parsed} ok=${ok}`);
    return ok ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Manages localStorage-backed video playback progress for a single chapter.
 * Uses `useMemo` for `savedTime` so it re-reads from localStorage when
 * `chapterId` changes (e.g. user opens lightbox for a different chapter).
 *
 * @param chapterId - The tutorial chapter ID (e.g. "01"), or undefined if no
 *   chapter is currently active in the lightbox.
 * @returns savedTime, saveProgress, and clearProgress helpers.
 */
export function useVideoProgress(chapterId: string | undefined) {
  const savedTime = useMemo<number | undefined>(() => {
    if (!chapterId) return undefined;
    return readSavedTime(chapterId);
  }, [chapterId]);

  const saveProgress = useCallback(
    (time: number) => {
      if (!chapterId) return;
      try {
        if (typeof window === "undefined") return;
        if (Number.isFinite(time) && time > 0) {
          const key = getStorageKey(chapterId);
          console.log(`[useVideoProgress] save chapter=${chapterId} key="${key}" time=${time}`);
          localStorage.setItem(key, String(time));
        } else {
          console.log(`[useVideoProgress] save SKIPPED chapter=${chapterId} time=${time} isFinite=${Number.isFinite(time)}`);
        }
      } catch {
        /* ignore — storage may be full or unavailable */
      }
    },
    [chapterId],
  );

  const clearProgress = useCallback(() => {
    if (!chapterId) return;
    try {
      if (typeof window === "undefined") return;
      localStorage.removeItem(getStorageKey(chapterId));
    } catch {
      /* ignore */
    }
  }, [chapterId]);

  return { savedTime, saveProgress, clearProgress } as const;
}
