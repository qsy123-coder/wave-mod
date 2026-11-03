/**
 * 首次冷启动 / 首页缓存被清后的整页加载动画 —— 判定与引导脚本。
 *
 * 背景：首页在两种情况下会「白屏好几秒」：
 *   1. 用户**第一次**访问站点（浏览器什么缓存都没有，Vercel 函数可能冷启动）；
 *   2. nginx 的首页 HTML 缓存刚被清掉（或过期回源），首个访客等 Vercel 现算。
 * 其余时候页面是秒开的，这时再盖一层动画只会变成闪烁，所以必须**条件触发**。
 *
 * 判定口径（与 `buildBootOverlayScript` 里的内联实现保持一致）：
 *   - 脚本执行时距导航开始已经 ≥ `BOOT_OVERLAY_SLOW_MS` → 说明确实慢，显示；
 *   - 否则**一律不显示** —— 页面已经秒开时再盖一层动画，只会把「秒进」变成「等动画」。
 *
 * 2026-11-03 改：此前还有一支「本次会话第一次访问就无条件显示」，后果是新标签页 /
 * 清过 sessionStorage 之后，哪怕页面 200ms 就绪也要被动画挡住 700ms+。用户明确要求
 * 「只在冷启动的时候加载」——冷启动的真实信号就是慢，而不是「没见过」。
 *
 * ⚠️ 内联脚本只在**硬加载**时生效（`document.readyState === "loading"`）：
 * 站内客户端导航到 `/` 时 `performance.now()` 早就是几十秒了，不挡住就会误判成「慢」。
 */

/** 挂在 `<html>` 上的开关属性：`on` 时遮罩可见，`off` 时整块不参与渲染 */
export const BOOT_OVERLAY_ATTR = "data-boot-overlay";

/** 遮罩出现时刻（performance.now() 的毫秒数），组件用它算「还差多少满最短停留时间」 */
export const BOOT_OVERLAY_STARTED_AT_ATTR = "data-boot-at";

/** 超过这么久还没出首屏，就认为「这次确实慢」，值得盖一层动画 */
export const BOOT_OVERLAY_SLOW_MS = 800;

/**
 * 硬上限：遮罩最多挡这么久。
 *
 * 兜底的是「JS 加载失败 / React 水合挂了」这种情形 —— 此时组件里的隐藏逻辑永远不会跑，
 * 全靠内联脚本这个定时器把页面放出来。宁可露出半成品页面，也不能把站点锁死。
 */
export const BOOT_OVERLAY_MAX_MS = 12_000;

/**
 * 纯判定：这次要不要显示冷启动动画。
 *
 * 只看「慢不慢」：快就一帧都不闪，慢（冷启动 / 缓存回源）才盖。
 *
 * @param elapsedMs 从导航开始到脚本生效的毫秒数
 */
export function shouldShowBootOverlay({
  elapsedMs,
  slowThresholdMs = BOOT_OVERLAY_SLOW_MS,
}: {
  elapsedMs: number;
  slowThresholdMs?: number;
}): boolean {
  if (!Number.isFinite(elapsedMs)) return false;
  return elapsedMs >= slowThresholdMs;
}

/**
 * 首屏前同步执行的脚本：决定开关、记下出现时刻。
 *
 * 必须内联在 HTML 里（不能等 React 水合）：它要在**第一次绘制之前**决定遮罩可见性，
 * 否则用户会先看到白屏/半成品页面再被盖上动画。
 *
 * 唯一判据是 `performance.now()`：它从导航开始计时，包含服务端响应与 HTML 下载，
 * 所以「Vercel 冷启动 / nginx 缓存回源」会自然落进 ≥ 阈值那一支；页面快时一帧都不闪。
 */
export function buildBootOverlayScript(): string {
  return `(function(){try{
if(document.readyState!=="loading")return;
var d=document.documentElement;
var elapsed=0;
try{elapsed=window.performance&&window.performance.now?window.performance.now():0;}catch(e){}
var show=(elapsed>=${BOOT_OVERLAY_SLOW_MS});
d.setAttribute(${JSON.stringify(BOOT_OVERLAY_ATTR)},show?"on":"off");
if(show){
d.setAttribute(${JSON.stringify(BOOT_OVERLAY_STARTED_AT_ATTR)},String(Math.round(elapsed)));
try{window.setTimeout(function(){try{d.setAttribute(${JSON.stringify(BOOT_OVERLAY_ATTR)},"off");}catch(e){}},${BOOT_OVERLAY_MAX_MS});}catch(e){}
}
}catch(e){}})();`;
}
