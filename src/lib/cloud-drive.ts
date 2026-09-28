/**
 * 网盘「复制链接后怎么用」的文案与教程图。
 *
 * 站内所有复制网盘链接的地方（mod 详情页、卡片、教程页工具下载）都共用这一份：
 * 提示文案一旦各写各的，就会出现「同一个迅雷链接，三个页面三种说法」。
 *
 * 改文案时注意：**只有会唤起客户端的调用方**才传 `client`，而且只有夸克/迅雷有客户端。
 * 文案里「正在尝试打开」这种话，说了就必须真发生 —— 否则用户白等一个不会出现的窗口。
 */

import { driveClientKind } from "./drive-client";

export type DriveCopyTip = {
  /** 让用户去客户端怎么操作 */
  advice: string;
  /** 为什么不要在网页里直接打开 */
  warning: string;
  /** 操作教程图（public/tips/），没有就返回 null */
  tipImage: string | null;
};

export type DriveCopyTipOptions = {
  /**
   * 这一次复制到底有没有去唤起客户端：
   *
   * - `"launch"`        —— 真的发起了唤起（见 drive-client-launch.ts）
   * - `"already-open"`  —— 调用方会唤起，但这次跳过了：这个网盘本会话已经唤起过一次，
   *                        客户端应该已经在（用户 2026-09-28 明确要求别把它重复切到前台）
   * - 不传              —— 调用方不唤起。教程页工具下载（tool-download-card.tsx）
   *                        复用同一份文案但不唤起，传了就会对着用户撒谎
   */
  client?: "launch" | "already-open";
};

export const DRIVE_WEB_WARNING =
  "网页端打开则可能限速、需要反复登录。";

/** 按平台名（宽松匹配中英文）返回提示文案与教程图 */
export function driveCopyTip(
  platform: string,
  options: DriveCopyTipOptions = {},
): DriveCopyTip {
  // 没有客户端的平台一律按「不唤起」说：它既不会被唤起、也就不可能「已经唤起过」。
  // 两个条件缺一个，文案都会变成假话。
  const mode = driveClientKind(platform) === null ? "none" : (options.client ?? "none");

  if (/迅雷|xunlei/i.test(platform)) {
    return {
      advice:
        mode === "launch"
          ? `正在尝试打开${platform}客户端，在上方搜索框粘贴链接转存下载`
          : mode === "already-open"
            // 不说「刚才」：去重按网盘，上一次唤起可能是好几个 mod 之前，说「刚才」不准
            ? `本会话已经打开过${platform}客户端，在上方搜索框粘贴链接转存下载`
            : "打开迅雷客户端，在上方搜索框粘贴链接转存下载",
      warning: DRIVE_WEB_WARNING,
      tipImage: "/tips/xunlei.png",
    };
  }

  if (/夸克|quark/i.test(platform)) {
    return {
      advice:
        mode === "launch"
          ? `正在尝试打开${platform}客户端，它会读取剪贴板弹出下载框`
          : mode === "already-open"
            // 不说「刚才」，理由同迅雷那条
            ? `本会话已经打开过${platform}客户端，直接在里面粘贴链接下载`
            : `打开${platform}客户端会弹出下载框`,
      warning: DRIVE_WEB_WARNING,
      tipImage: "/tips/quark.png",
    };
  }

  return {
    advice: `打开${platform}客户端粘贴链接下载`,
    warning: DRIVE_WEB_WARNING,
    tipImage: null,
  };
}
