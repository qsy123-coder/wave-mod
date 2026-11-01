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
 * 「点了首页但被直达分类拦下」的窗口事件名。
 *
 * 导航栏里的首页/Logo 链接分布在不同组件里，而拦截弹窗挂在根布局 —— 用事件解耦：
 * 链接处只负责 preventDefault + dispatch，弹窗自己决定怎么展示。
 */
export const AUTO_OPEN_MODS_BLOCK_EVENT = "wavemod:auto-open-mods-blocked";

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

/**
 * 首页直达脚本：**输入网址 / 直接打开首页**时，首屏绘制前换到 `/mods`。
 *
 * 分工（2026-11-02 明确）：
 *   - 用户自己敲地址进站 → 偏好说了算，直接去分类页，不打扰；
 *   - 用户已经站内、点「首页」想回去 → 由导航栏捕获链接派发
 *     `AUTO_OPEN_MODS_BLOCK_EVENT`，弹框问一句（AutoOpenModsPrompt）。
 *
 * ⚠️ 必须只在**硬加载**时执行（`document.readyState === "loading"`）：站内客户端导航
 * 到 `/` 时 React 会把这段脚本重新挂进 DOM，不挡的话会绕过拦截弹窗直接跳走。
 *
 * 用 `location.replace` 而不是 `location.href`：不产生历史记录，否则按后退会回到 `/`
 * 又被弹回 `/mods`，形成退不出去的死循环。
 */
export function buildAutoOpenModsScript(): string {
  // 跳转前留标记：落地 /mods 后由 AutoOpenModsNotice 说明「为什么直接到了分类页」
  return `(function(){try{
if(document.readyState!=="loading")return;
if(location.pathname!=="/")return;
if(window.localStorage.getItem(${JSON.stringify(AUTO_OPEN_MODS_STORAGE_KEY)})==="1"){
try{window.sessionStorage.setItem(${JSON.stringify(AUTO_SKIP_NOTICE_KEY)},"1");}catch(e){}
location.replace("/mods");
}}catch(e){}})();`;
}
