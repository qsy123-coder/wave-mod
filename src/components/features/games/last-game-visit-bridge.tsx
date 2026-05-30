"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { getGameKeyFromPathname, LAST_GAME_COOKIE_NAME } from "@/lib/games/last-game";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function LastGameVisitBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const gameKey = getGameKeyFromPathname(pathname);

    if (!gameKey) {
      return;
    }

    document.cookie = `${LAST_GAME_COOKIE_NAME}=${encodeURIComponent(gameKey)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }, [pathname]);

  return null;
}
