"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks which chapter section is currently most visible in the viewport.
 * Uses a single IntersectionObserver with weighted ratio comparison.
 *
 * @param chapterIds - Ordered array of chapter IDs to observe (e.g., ["00","01","02","03","04"])
 * @returns The ID of the currently active chapter, or null before first observation
 */
export function useScrollSpy(chapterIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const ratiosRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const ratios = ratiosRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        // Update ratio for each observed entry
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-chapter-id");
          if (id) {
            ratios.set(id, entry.intersectionRatio);
          }
        }

        // Pick the chapter with the highest intersection ratio.
        // If multiple chapters have the same ratio, pick the first one (higher on page).
        let bestId: string | null = null;
        let bestRatio = 0;

        for (const id of chapterIds) {
          const ratio = ratios.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }

        if (bestId && bestRatio > 0) {
          setActiveId(bestId);
        }
      },
      {
        // rootMargin: top offset for sticky nav (~60px), bottom bias so the
        // chapter entering from the top wins over the one leaving at the bottom
        rootMargin: "-64px 0px -50% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    // Observe all chapter sections
    const elements = document.querySelectorAll("[data-chapter-id]");
    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      ratios.clear();
    };
  }, [chapterIds]);

  return activeId;
}
