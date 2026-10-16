/**
 * 页面视觉风格（皮肤）切换 — 常量与类型定义
 *
 * 与 `@/lib/layout-style/constants` 是**两套独立机制**，别混用：
 * - 本文件（theme-*）：站点通用的配色皮肤，由头部「风格」下拉切换。
 * - layout-style（zzz-*）：绝区零路由专属的沉浸/深色皮肤。
 *
 * 三款皮肤：
 * - "theme-arcade"        默认 · 奶油底街机风
 * - "theme-neon-night"    高对比冷色夜景
 * - "theme-sunset-flyer"  落日暖色
 *
 * 历史上还有第四款 "theme-neumorphism"（新拟物派），2026-10-16 用户要求下线。
 * 老访客的 cookie / localStorage 里可能还留着这个值 —— 它不在这里的清单里，
 * 读出来会被 isThemeName 判为非法，自动落回 DEFAULT_THEME，不需要额外迁移。
 */
export const THEMES = [
  "theme-arcade",
  "theme-neon-night",
  "theme-sunset-flyer",
] as const;

export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = "theme-arcade";

/**
 * cookie 名。
 *
 * `src/app/layout.tsx` 的防闪脚本会把它 `JSON.stringify` 进去，所以改名只需改这里；
 * 但**不要**把它变成带 `"` 或 `\` 的值（会破坏内联脚本的字符串字面量）。
 */
export const THEME_COOKIE = "wavemod-theme";

/** localStorage 键。历史上主题只存在这里，cookie 是后加的，读取时仍需兼容旧值。 */
export const THEME_STORAGE_KEY = "wavemod-theme";

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 运行时类型收窄：任何外部输入（cookie / localStorage / 远端）都要过这一关。 */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * 从 `document.cookie` 那种字符串里解析出当前皮肤。纯函数，便于单测。
 *
 * 与 `ThemeProvider` 内部读 cookie 的逻辑保持一致——首屏防闪内联脚本、
 * provider 的水合读取、这里三处都得以同一套白名单为准，各写一遍会漂移。
 */
export function parseThemeCookie(cookieString: string): ThemeName | null {
  for (const part of cookieString.split(";")) {
    const entry = part.trim();
    if (!entry.startsWith(`${THEME_COOKIE}=`)) continue;
    try {
      const value = decodeURIComponent(entry.slice(THEME_COOKIE.length + 1));
      return isThemeName(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

