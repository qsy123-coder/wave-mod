/**
 * 站点级浏览偏好（只存本机 localStorage）。
 *
 * 两个布尔值：
 *  - 直达分类：访问 `/` 时是否在**首次绘制前**换到 `/mods`；
 *  - 沉浸布局：`/mods` 是否隐藏左侧栏与顶部导航栏。
 *
 * 为什么不进数据库：两者都与「这台设备、这块屏幕」强相关（手机上沉浸没有意义，
 * 直达分类更像个人习惯），跨设备同步带不来多少价值，却要让每个页面多一次取数。
 * 与 `mod-layout-preference`（use-layout-preference.ts）保持同一套本机持久化口径。
 */

export const AUTO_OPEN_MODS_STORAGE_KEY = "wavemod-auto-open-mods";
export const IMMERSIVE_MODS_STORAGE_KEY = "wavemod-mods-immersive";

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

/**
 * 首页直达脚本：**必须在 HTML 解析阶段同步执行**（不能 async/defer），
 * 否则用户会先看到首页 Hero 再被跳走。
 *
 * 用 `location.replace` 而不是 `location.href`：不产生历史记录。否则用户按后退
 * 会回到 `/`，脚本又把它们弹回 `/mods`，形成「后退永远退不出去」的死循环。
 *
 * 只处理路径恰好是 `/` 的情形：`(home)` 布局目前只包这一条路由，写上是为了
 * 将来往里加页面时不误跳。localStorage 抛错（隐私模式）时静默放行首页。
 *
 * 客户端导航（例如点 logo 从 `/mods` 回 `/`）不会重新执行 `<script>`，
 * 那条路径由 `HomeAutoRedirect` 兜底。
 */
export function buildAutoOpenModsScript(): string {
  return `(function(){try{if(location.pathname!=="/")return;if(window.localStorage.getItem(${JSON.stringify(
    AUTO_OPEN_MODS_STORAGE_KEY,
  )})==="1"){location.replace("/mods");}}catch(e){}})();`;
}
