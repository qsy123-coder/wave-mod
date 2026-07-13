export const siteConfig = {
  name: "鸣潮角色MOD个人站",
  shortName: "WaveMod",
  description: "高清预览、阿里云 OSS 高速直链下载、单主理人精选发布。",
  primaryNav: [
    { label: "首页", href: "/" },
    { label: "角色分类", href: "/mods" },
    { label: "图库", href: "/gallery" },
    { label: "先看我", href: "/guide" },
    { label: "支持本站", href: "/support" },
  ],
  supportLinks: [
    { label: "Patreon", href: "#" },
    { label: "爱发电", href: "#" },
    { label: "微信赞赏", href: "#" },
  ],
  disclaimer:
    "本站内容仅供学习与交流用途，与游戏官方无关。请在下载与使用前自行确认版本兼容性。",
} as const;
