/**
 * 教程页「下载必要工具」的网盘分享链接。
 *
 * 这些是 JASM mod 管理器 / XXMI 启动器 / 鸣潮 mod 修复工具 的打包分享，
 * 由人工上传到网盘后填在这里 —— 换分享会失效，改这里即可，不用动组件。
 *
 * ⚠️ 链接必须带 `pwd=` 密码参数：复制给用户的是完整 URL，少一段对方就转存不了。
 * 对应单测：tool-download.test.ts。
 */

export type ToolDrive = {
  /** 网盘名，同时用于品牌提示文案（见 lib/cloud-drive.ts） */
  platform: string;
  /** 完整分享链接（含提取码） */
  url: string;
};

/** 页面上「下载必要工具」面板的正文说明 */
export const REQUIRED_TOOLS_SUMMARY =
  "JASM mod 管理器、XXMI 启动器和鸣潮 mod 修复工具已打包上传网盘。";

export const REQUIRED_TOOL_DRIVES: readonly ToolDrive[] = [
  {
    platform: "夸克网盘",
    url: "https://pan.quark.cn/s/33b3393dd339?pwd=yKWp",
  },
  {
    platform: "迅雷网盘",
    url: "https://pan.xunlei.com/s/VP2DElJNg8VRALqYgL2sra45A1?pwd=z9v3#",
  },
];
