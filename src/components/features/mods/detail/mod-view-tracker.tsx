"use client";

import { useEffect } from "react";

export function ModViewTracker({ modId }: { modId: string }) {
  useEffect(() => {
    const storageKey = `wavemod:viewed:${modId}`;

    if (typeof window === "undefined") {
      return;
    }

    if (window.sessionStorage.getItem(storageKey)) {
      return;
    }

    window.sessionStorage.setItem(storageKey, "1");

    void fetch(`/api/mods/${modId}/view`, {
      method: "POST",
      cache: "no-store",
    });
  }, [modId]);

  return null;
}
