export type GameKey = "wuthering-waves" | "zenless-zone-zero" | "genshin-impact";

export type GameConfig = {
  key: GameKey;
  name: string;
  shortName: string;
  slug: GameKey;
  description: string;
  enabled: boolean;
  useCustomLayout: boolean;
  theme: {
    accent: string;
    background: string;
    muted: string;
    primary: string;
  };
  nav: {
    guide: string;
    home: string;
    mods: string;
    profile?: string;
    ranking?: string;
    stats?: string;
  };
};

export const defaultGameKey = "wuthering-waves" satisfies GameKey;

export const games = [
  {
    key: "wuthering-waves",
    name: "主站",
    shortName: "主站",
    slug: "wuthering-waves",
    description: "角色外观资源、XXMI 安装指引与直链下载。",
    enabled: true,
    useCustomLayout: false,
    theme: {
      accent: "#FFD93D",
      background: "#050816",
      muted: "#BCAEFF",
      primary: "#FF7A7A",
    },
    nav: {
      home: "/wuthering-waves",
      mods: "/wuthering-waves/mods",
      guide: "/wuthering-waves/guide",
      profile: "/wuthering-waves/profile",
      ranking: "/wuthering-waves/ranking",
    },
  },
  {
    key: "zenless-zone-zero",
    name: "分站二",
    shortName: "分站二",
    slug: "zenless-zone-zero",
    description: "分站二预留入口，当前复用通用外观资源功能。",
    enabled: true,
    useCustomLayout: false,
    theme: {
      accent: "#FACC15",
      background: "#080808",
      muted: "#E5E7EB",
      primary: "#EF4444",
    },
    nav: {
      home: "/zenless-zone-zero",
      mods: "/zenless-zone-zero/mods",
      guide: "/zenless-zone-zero/guide",
      profile: "/zenless-zone-zero/profile",
      ranking: "/zenless-zone-zero/ranking",
    },
  },
  {
    key: "genshin-impact",
    name: "分站三",
    shortName: "分站三",
    slug: "genshin-impact",
    description: "分站三预留入口，当前复用通用外观资源功能。",
    enabled: true,
    useCustomLayout: false,
    theme: {
      accent: "#FBBF24",
      background: "#061626",
      muted: "#BFDBFE",
      primary: "#60A5FA",
    },
    nav: {
      home: "/genshin-impact",
      mods: "/genshin-impact/mods",
      guide: "/genshin-impact/guide",
      profile: "/genshin-impact/profile",
      ranking: "/genshin-impact/ranking",
    },
  },
] satisfies GameConfig[];

export function getEnabledGames(): GameConfig[] {
  return games.filter((game) => game.enabled);
}

export function getGameBySlug(slug: string | undefined) {
  return getEnabledGames().find((game) => game.slug === slug) ?? null;
}

export function getDefaultGame(): GameConfig {
  return games.find((game) => game.key === defaultGameKey) ?? games[0];
}

export function getGamePath(game: GameConfig, path: "guide" | "home" | "mods" | "ranking" | "stats" = "home") {
  return game.nav[path] ?? game.nav.home;
}
