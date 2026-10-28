/**
 * 访问统计里**客户端也要知道**的常量。
 *
 * 单独一个文件的原因：`./cookie` 用了 `node:crypto`，客户端组件（打点器）
 * 只要 import 它就会把 node 内置模块带进浏览器包。名字放这里，两边共用一份。
 */

export const VISITS_COOKIE = "wavemod-visits";

/**
 * 站长设备标记。**不能 httpOnly**：打点器要在浏览器里读它来决定跳不跳。
 * 它只是一句「这台设备不计数」，被篡改的后果也只是站长自己的浏览被算进去。
 */
export const NOCOUNT_COOKIE = "wavemod-nocount";

/** 凭证有效期：30 天 */
export const VISITS_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/** 这些路径下的浏览不计入站点统计（后台调试、统计页本身） */
export const VISITS_SKIP_PREFIXES = ["/admin", "/visits"] as const;
