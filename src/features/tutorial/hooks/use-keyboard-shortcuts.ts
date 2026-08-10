"use client";

import { useEffect } from "react";

/** Keys that should prevent default to avoid page scroll / focus changes. */
const PREVENT_DEFAULT_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

/**
 * Registers global keyboard shortcuts. Supports multiple active shortcuts
 * simultaneously by mapping `KeyboardEvent.code` values to handler callbacks.
 *
 * Shortcuts that would cause page scroll (arrows, space) automatically call
 * `e.preventDefault()` before firing the handler.
 *
 * @param shortcuts - A record mapping `KeyboardEvent.code` → handler.
 *                    Pass a stable reference (useMemo / module-level constant)
 *                    to avoid unnecessary re-registration.
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, (e: KeyboardEvent) => void>,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const handler = shortcuts[e.code];
      if (!handler) return;

      if (PREVENT_DEFAULT_KEYS.has(e.code)) {
        e.preventDefault();
      }
      handler(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}
