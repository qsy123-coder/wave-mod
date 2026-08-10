"use client";

import { useState, useEffect } from "react";
import { ArrowBigDown, X } from "lucide-react";

const STORAGE_KEY = "wavemod-video-hint-dismissed";

/**
 * Animated hint arrow pointing at the "均有对应视频教程" text.
 * - Outer span bounces (animate-bounce) so it doesn't conflict with rotation
 * - Inner SVG rotated 45° → points from upper-right diagonally toward the text
 * - Close button stays still (outside the bouncing wrapper)
 * - Uses useState(true) + useEffect to avoid SSR hydration mismatch
 */
export function VideoHintBanner() {
  // Start hidden on server to avoid hydration mismatch;
  // useEffect runs client-side to read the real localStorage value
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== "1") {
          setDismissed(false);
        }
      } catch {
        setDismissed(false);
      }
    });
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <span
      className="relative inline-block border-[2px] border-black px-1.5 py-2"
      style={{ background: "var(--neo-accent)" }}
    >
      均有对应视频教程

      {!dismissed && (
        <>
          {/* Bouncing wrapper — animation goes here so rotate stays intact */}
          <span className="pointer-events-none absolute -right-20 -top-20 block animate-arrow-diag">
            <span className="block" style={{ transform: "rotate(45deg)" }}>
              <ArrowBigDown
                className="size-20 text-[var(--neo-accent)] drop-shadow-[2px_2px_0px_#000]"
                style={{ fill: "var(--neo-accent)" }}
                aria-hidden="true"
              />
            </span>
          </span>

          {/* Close button — stationary, near the arrow tail */}
          <button
            type="button"
            onClick={handleDismiss}
            className="pointer-events-auto absolute -right-20 -top-20 inline-flex size-5 items-center justify-center rounded-full border-2 border-black bg-white transition hover:bg-red-100"
            aria-label="关闭提示"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </span>
  );
}
