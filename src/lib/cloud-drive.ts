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
   * - 不传              —— 调用方不唤起。只有真正调了 launchDriveClient 的地方
   *                        才能传，否则文案会对着用户撒谎
   */
  client?: "launch" | "already-open";
};

export const DRIVE_WEB_WARNING =
  "网页端打开则可能限速、需要反复登录。";

/**
 * 手机端的核心操作提醒（用户 2026-10-29 明确要求）：分享页里直接下载通常受限，
 * 必须先「转存」（保存到自己的网盘）再从自己的网盘下载。
 *
 * 这句只讲步骤、不承诺任何系统行为 —— 手机上是否跳 App 取决于装没装、认领没认领 App Link。
 */
export const DRIVE_MOBILE_TRANSFER_HINT =
  "先在 App 里把文件「转存」到自己的网盘，再从自己的网盘下载。";

/** 「夸克网盘」→「夸克」：手机端文案里「夸克网盘 App」读起来太绕 */
function driveAppName(platform: string): string {
  const trimmed = platform.trim().replace(/\s*网盘$/, "");
  return trimmed || platform;
}

export type DriveMobileTipOptions = {
  /** 链接这次有没有真的复制成功 —— 没成功就绝不能说「已复制」 */
  copied: boolean;
  /**
   * 有没有去打开分享页。手机端没有可靠的客户端协议（见 drive-client.ts 的说明），
   * 打开的是 https 分享页：装了 App 的系统会由 Universal Link / App Link 接管成 App，
   * 所以文案只说「打开分享页」，不保证「正在打开 App」。
   */
  opened: boolean;
};

/**
 * 手机端「复制 + 打开」后的提示。
 *
 * 与桌面端的 {@link driveCopyTip} 是两套口径：桌面是「唤起客户端读剪贴板」，
 * 手机是「打开分享页 → 在 App 里转存 → 从自己的网盘下载」。
 * 不含教程图 —— public/tips/ 那两张是桌面客户端截图，手机上照着做不了。
 */
export function driveMobileTip(platform: string, options: DriveMobileTipOptions): DriveCopyTip {
  const app = driveAppName(platform);

  if (!options.copied) {
    return {
      advice: options.opened
        ? `链接复制失败，已为你打开${platform}分享页，可在页面里手动复制`
        : `链接复制失败，请打开${app} App 手动粘贴链接`,
      warning: DRIVE_MOBILE_TRANSFER_HINT,
      tipImage: null,
    };
  }

  return {
    advice: options.opened
      ? `已复制${platform}链接，正在打开分享页（装了 App 会自动跳到 App）`
      : `已复制${platform}链接，请打开${app} App 粘贴`,
    warning: DRIVE_MOBILE_TRANSFER_HINT,
    tipImage: null,
  };
}

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
