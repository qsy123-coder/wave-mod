import type { TutorialConfig } from "./types";
import { tutorialConfigSchema } from "./types";

const rawConfig: TutorialConfig = {
  title: "鸣潮MOD使用详细教程",
  subtitle: "先看我",
  imageBasePath: "/tutorial/",
  chapters: [
    {
      id: "00",
      title: "需要的工具和软件",
      type: "text",
      intro: "以下的 JASM mod 管理器、XXMI 启动器和鸣潮 mod 修复工具为必须下载的工具（三个工具已打包在同一个压缩包内）。如果你已有压缩工具，压缩工具按需下载，教程里用到的压缩工具为 360 压缩。",
      tools: [
        {
          name: "JASM mod 管理器",
          url: "https://github.com/qsy123-coder/wave-mod/releases/download/v1.0/JASM._v2.22.9.exe",
          description: "MOD 管理器，用于管理已安装的 MOD",
          required: true,
          cloudUrls: { baidu: "#", quark: "#" },
        },
        {
          name: "XXMI 启动器",
          url: "https://github.com/qsy123-coder/wave-mod/releases/download/v1.0/XXMI.exe",
          description: "MOD 启动器，用于加载和注入 MOD",
          required: true,
          cloudUrls: { baidu: "#", quark: "#" },
        },
        {
          name: "鸣潮 mod 修复工具",
          url: "https://github.com/qsy123-coder/wave-mod/releases/download/v1.0/Mod.v3.5.0.exe",
          description: "修复器，用于解决 MOD 兼容性问题",
          required: true,
          cloudUrls: { baidu: "#", quark: "#" },
        },
        {
          name: "360 压缩",
          url: "https://yasuo.360.cn/",
          description: "免费压缩解压工具",
          required: false,
        },
        {
          name: "WinRAR",
          url: "https://www.win-rar.com/",
          description: "经典压缩文件管理器",
          required: false,
        },
        {
          name: "7-Zip",
          url: "https://www.7-zip.org/",
          description: "免费开源压缩工具",
          required: false,
        },
      ],
    },
    {
      id: "01",
      title: "工具的解压",
      type: "images",
      images: ["0.webp", "1.webp", "1-1.webp", "1-2.webp", "2.webp"],
    },
    {
      id: "02",
      title: "XXMI 的安装以及 mod 导入",
      type: "images",
      images: Array.from({ length: 36 }, (_, i) => `${i + 3}.webp`),
    },
    {
      id: "03",
      title: "游戏内 mod 效果以及修复器的使用",
      type: "images",
      images: [...Array.from({ length: 9 }, (_, i) => `${i + 39}.webp`), "76.webp"],
    },
    {
      id: "04",
      title: "JASM mod 管理器的安装以及 mod 导入",
      type: "images",
      images: Array.from({ length: 28 }, (_, i) => `${i + 48}.webp`),
    },
  ],
};

// Zod validates at module load time — catches config errors at build
export const tutorialConfig: TutorialConfig =
  tutorialConfigSchema.parse(rawConfig);
