/**
 * 网盘「复制链接后怎么用」的文案与教程图。
 *
 * 站内所有复制网盘链接的地方（mod 详情页、卡片、教程页工具下载）都共用这一份：
 * 提示文案一旦各写各的，就会出现「同一个迅雷链接，三个页面三种说法」。
 */

export type DriveCopyTip = {
  /** 让用户去客户端怎么操作 */
  advice: string;
  /** 为什么不要在网页里直接打开 */
  warning: string;
  /** 操作教程图（public/tips/），没有就返回 null */
  tipImage: string | null;
};

export const DRIVE_WEB_WARNING =
  "网页端打开则可能限速、需要反复登录。";

/** 按平台名（宽松匹配中英文）返回提示文案与教程图 */
export function driveCopyTip(platform: string): DriveCopyTip {
  if (/迅雷|xunlei/i.test(platform)) {
    return {
      advice: "打开迅雷客户端，在上方搜索框粘贴链接转存下载",
      warning: DRIVE_WEB_WARNING,
      tipImage: "/tips/xunlei.png",
    };
  }

  if (/夸克|quark/i.test(platform)) {
    return {
      advice: `打开${platform}客户端会弹出下载框`,
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
