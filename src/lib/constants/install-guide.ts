// 第 3 条里的 `XXMI Mods` 是启动器的**真实目录名**，不是本站文案，别"顺手"一起改。
export const xxmiInstallGuide = [
  "1. 下载并解压对应的外观资源压缩包。",
  "2. 打开 XXMI Launcher，确认当前游戏版本与外观资源版本匹配。",
  "3. 将资源文件夹复制到 XXMI Mods 目录。",
  "4. 返回启动器启用对应角色模组后进入游戏检查效果。",
] as const;

export const xxmiInstallGuideText = xxmiInstallGuide.join("\n");
