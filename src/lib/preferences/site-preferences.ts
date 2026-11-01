/**
 * 站点级浏览偏好（只存本机 localStorage）。
 *
 * 两个布尔值：
 *  - 直达分类：访问 `/` 时是否先弹窗拦一下、问要不要直接去 `/mods`
 *    （2026-11-02 从「静默跳转」改成弹窗，见 AutoOpenModsPrompt）；
 *  - 沉浸布局：`/mods` 是否隐藏左侧栏与顶部导航栏。
 *
 * 为什么不进数据库：两者都与「这台设备、这块屏幕」强相关（手机上沉浸没有意义，
 * 直达分类更像个人习惯），跨设备同步带不来多少价值，却要让每个页面多一次取数。
 * 与 `mod-layout-preference`（use-layout-preference.ts）保持同一套本机持久化口径。
 */

export const AUTO_OPEN_MODS_STORAGE_KEY = "wavemod-auto-open-mods";
export const IMMERSIVE_MODS_STORAGE_KEY = "wavemod-mods-immersive";

/**
 * 「刚才在首页弹窗里选了『前往分类页』」的一次性标记（sessionStorage）。
 *
 * 用户在弹窗里确认过后，落地 `/mods` 仍给一条说明条（带「关闭该偏好」入口），
 * 免得他下次又忘 —— 用完即删，刷新不会重复打扰。
 */
export const AUTO_SKIP_NOTICE_KEY = "wavemod-auto-skip-notice";

/**
 * 沉浸切换时右栏宽度的变化量 = 侧栏 240px + 父容器布局 gap 24px。
 *
 * 网格用它把「切换前宽度」换算成目标宽度，先按目标宽度排一次版，再用 transform
 * 把目标布局映射回旧布局的形状做缩放过渡（见 mods-infinite-grid 的 FLIP 逻辑）。
 * 侧栏宽度见 `mods-listing-view.tsx` 的 `lg:w-[240px]`，gap 见
 * `(site)/mods/layout.tsx` 的 `gap-6`；改这两处时同步改这个常量。
 */
export const MODS_SIDEBAR_LAYOUT_SHIFT = 264;

/** 存储值只认 `"1"`；其余（含 null / 脏数据）一律视为关闭。 */
export function parseStoredFlag(value: string | null): boolean {
  return value === "1";
}

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return parseStoredFlag(window.localStorage.getItem(key));
  } catch {
    // 隐私模式 / 禁用存储：读不到就当关闭，不影响页面本身
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 写不进去只影响「下次还记不记得」，本次会话的 React 状态照常生效
  }
}

export function readAutoOpenMods(): boolean {
  return readFlag(AUTO_OPEN_MODS_STORAGE_KEY);
}

/** 跳过首页前打标记（sessionStorage 不可用时静默放弃，提示只是锦上添花） */
export function markAutoSkipNotice(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTO_SKIP_NOTICE_KEY, "1");
  } catch {
    // 隐私模式：读不到就当作没有提示，不影响跳转本身
  }
}

/**
 * 取走提示标记：有标记返回 true 并立刻清掉。
 *
 * 必须在**展示时**就清，而不是等用户点关闭 —— 否则用户点了浏览器刷新，
 * 同一次跳转的提示又会弹一遍。
 */
export function consumeAutoSkipNotice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flagged = window.sessionStorage.getItem(AUTO_SKIP_NOTICE_KEY) === "1";
    if (flagged) window.sessionStorage.removeItem(AUTO_SKIP_NOTICE_KEY);
    return flagged;
  } catch {
    return false;
  }
}

export function writeAutoOpenMods(value: boolean): void {
  writeFlag(AUTO_OPEN_MODS_STORAGE_KEY, value);
}

export function readImmersiveMods(): boolean {
  return readFlag(IMMERSIVE_MODS_STORAGE_KEY);
}

export function writeImmersiveMods(value: boolean): void {
  writeFlag(IMMERSIVE_MODS_STORAGE_KEY, value);
}

/** 是否属于角色分类页（含 `/mods/<id>` 详情抽屉路由）。 */
export function isModsPathname(pathname: string): boolean {
  return pathname === "/mods" || pathname.startsWith("/mods/");
}

/**
 * 沉浸态是否真正生效。
 *
 * 三个条件缺一不可：用户开着沉浸、是桌面宽度（≥ lg 1024px）、当前在 `/mods`。
 * 手机端虽然状态仍保留，但不隐藏导航栏 —— 那是手机上唯一的入口
 * （见 use-is-desktop.ts 与 PRD「手机端」一节）。
 */
export function isImmersiveActive({
  immersive,
  isDesktop,
  pathname,
}: {
  immersive: boolean;
  isDesktop: boolean;
  pathname: string;
}): boolean {
  return immersive && isDesktop && isModsPathname(pathname);
}

/*
 * 以前这里还有一个 `buildAutoOpenModsScript()`：在首页首屏绘制前 `location.replace("/mods")`。
 * 2026-11-02 起改成**弹窗拦截**（AutoOpenModsPrompt）：
 *   - 静默跳转没有任何解释，用户点首页却落到分类页，容易以为首页坏了；
 *   - 弹窗还能当场关掉这个偏好，不用再回账户菜单里找。
 * 所以那段内联脚本与配套的 HomeAutoRedirect 一并删掉了 —— 不要再加回来。
 */
