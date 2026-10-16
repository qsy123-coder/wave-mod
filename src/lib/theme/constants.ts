/**
 * 页面视觉风格（皮肤）切换 — 常量与类型定义
 *
 * 与 `@/lib/layout-style/constants` 是**两套独立机制**，别混用：
 * - 本文件（theme-*）：站点通用的配色皮肤，由头部「风格」下拉切换。
 * - layout-style（zzz-*）：绝区零路由专属的沉浸/深色皮肤。
 *
 * 四款皮肤：
 * - "theme-arcade"        默认 · 奶油底街机风
 * - "theme-neon-night"    高对比冷色夜景
 * - "theme-sunset-flyer"  落日暖色
 * - "theme-neumorphism"   新拟物派 —— 同色系浅底 + 双重柔和阴影，见
 *                         ui_design_docs/Neumorphism/neumorphism-design-spec.md
 */
export const THEMES = [
  "theme-arcade",
  "theme-neon-night",
  "theme-sunset-flyer",
  "theme-neumorphism",
] as const;

export type ThemeName = (typeof THEMES)[number];

/** 新拟物皮肤 id。多处需要单独判定（画布转浅、压制 zzz-dark），故单独导出。 */
export const NEUMORPHISM_THEME: ThemeName = "theme-neumorphism";

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
 * 单独抽出来是因为有两个地方要读：ThemeProvider（决定挂哪个类）与
 * LayoutStyleProvider（决定要不要压制 zzz-dark）。两处各写一遍正则会漂移。
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

/**
 * 皮肤变化事件（`window` 上派发）。
 *
 * ThemeProvider 换肤后会派发它，LayoutStyleProvider 借此重新计算要不要挂
 * `theme-zzz-dark` —— 两个 provider 是并列的兄弟节点，没有父子关系可以传递
 * 状态，用一个显式事件比互相读对方的 context 或轮询 DOM 都干净。
 */
export const THEME_CHANGE_EVENT = "wavemod:theme-change";
