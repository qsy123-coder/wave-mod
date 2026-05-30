import { defaultGameKey, getEnabledGames, type GameKey } from "@/config/games";

export const LAST_GAME_COOKIE_NAME = "wavemod-last-game";

export function getGameKeyFromPathname(pathname: string): GameKey | null {
  if (pathname === "/" || pathname.startsWith("/mods") || pathname.startsWith("/guide") || pathname.startsWith("/ranking")) {
    return defaultGameKey;
  }

  const segment = pathname.split("/").filter(Boolean)[0];
  return getEnabledGames().find((game) => game.slug === segment)?.key ?? null;
}

export function getEnabledGameByKey(gameKey: string | undefined | null) {
  return getEnabledGames().find((game) => game.key === gameKey) ?? null;
}
