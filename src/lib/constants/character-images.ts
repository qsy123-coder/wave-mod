/**
 * 角色名 → 头像图片路径映射。
 *
 * 源文件仍在 public/character-imgs/（备份与本地兜底），但前台实际读取的是 COS
 * 上的同名对象 —— 头像曾经走「香港 nginx → Vercel hkg1」的同源请求，单张缓存命中
 * 也要 0.45–0.85s；搬到 COS 后与卡片图同源（~0.2s），也不再占 Vercel 函数。
 *
 * 上传脚本：scripts/upload-character-avatars-to-cos.mjs
 * 以后若挂 CDN，把 NEXT_PUBLIC_CHARACTER_AVATAR_BASE 指到 CDN 域名即可。
 */
export const characterImageMap: Record<string, string> = {
  // 特殊分类
  "Skins": "/character-imgs/皮肤.png",
  "Other/Misc": "/character-imgs/其他角色.webp",
  "UI": "/character-imgs/UI界面.png",
  // 怪物（2026-10-17 由用户明确要求新建）：放周本 Boss 型 mod —— 改的是怪物模型、
  // 不是可操作角色，与同角色的本体 mod 不是一套东西（同「爱弥斯的机甲」的思路）。
  // 名字取自用户选定；头像由用户提供的 npc.webp 缩到 128×128。
  // ⚠️ 这里**不是** SPECIAL_CATEGORIES（Skins/UI/Other/Misc）那组置顶分类，
  // 所以它会按 zh-CN 排序出现在普通角色列表里。
  "怪物": "/character-imgs/怪物.webp",

  // 主站角色
  "秋水": "/character-imgs/秋水.webp",
  "奥古斯塔": "/character-imgs/奥古斯塔.webp",
  "白芷": "/character-imgs/白芷.webp",
  "布兰特": "/character-imgs/布兰特.webp",
  "卜灵": "/character-imgs/卜灵.webp",
  "卡卡罗": "/character-imgs/卡卡罗.webp",
  "椿": "/character-imgs/椿.webp",
  "坎特蕾拉": "/character-imgs/坎特蕾拉.webp",
  "珂莱塔": "/character-imgs/珂莱塔.webp",
  "卡提希娅": "/character-imgs/卡提希娅.webp",
  // 芙露德莉斯（卡提希娅的大卡形态）——2026-09-21 由用户明确要求新建的独立分类，
  // 暂与卡提希娅共用头像，等有专属图再换（同「爱弥斯的机甲」的处理方式）
  "芙露德莉斯": "/character-imgs/卡提希娅.webp",
  "长离": "/character-imgs/长离.webp",
  "千咲": "/character-imgs/千咲.webp",
  "炽霞": "/character-imgs/炽霞.webp",
  "达妮娅": "/character-imgs/达妮娅.webp",
  "夏空": "/character-imgs/夏空.webp",
  "丹瑾": "/character-imgs/丹瑾.webp",
  "安可": "/character-imgs/安可.webp",
  "绯雪": "/character-imgs/绯雪.webp",
  "嘉贝莉娜": "/character-imgs/嘉贝丽娜.webp",
  "爱弥斯": "/character-imgs/爱弥斯.webp",
  // 爱弥斯特有分类（2026-09-20 新建）：暂与爱弥斯共用头像，等有专属图再换
  "爱弥斯的机甲": "/character-imgs/爱弥斯.webp",
  "尤诺": "/character-imgs/尤诺.webp",
  "鉴心": "/character-imgs/鉴心.webp",
  "今汐": "/character-imgs/今汐.webp",
  "忌炎": "/character-imgs/忌炎.webp",
  "凌阳": "/character-imgs/凌阳.webp",
  "洛瑟菈": "/character-imgs/洛瑟菈.webp",
  "露西": "/character-imgs/露西.webp",
  "灯灯": "/character-imgs/灯灯.webp",
  "露帕": "/character-imgs/露帕.webp",
  "路赫斯": "/character-imgs/路赫斯.webp",
  "琳奈": "/character-imgs/琳奈.webp",
  "莫宁": "/character-imgs/莫宁.webp",
  "莫特斐": "/character-imgs/莫特斐.webp",
  "菲比": "/character-imgs/菲比.webp",
  "弗洛洛": "/character-imgs/弗洛洛.webp",
  "仇远": "/character-imgs/仇远.webp",
  "丽贝卡": "/character-imgs/丽贝卡.webp",
  "洛可可": "/character-imgs/洛可可.webp",
  "男漂": "/character-imgs/漂泊者.webp",
  "女漂": "/character-imgs/漂泊者.webp",
  "散华": "/character-imgs/散华.webp",
  "守岸人": "/character-imgs/守岸人.webp",
  "西格莉卡": "/character-imgs/西格莉卡.webp",
  "桃祈": "/character-imgs/桃祈.webp",
  "维里奈": "/character-imgs/维里奈.webp",
  "相里要": "/character-imgs/相里要.webp",
  "玄翎": "/character-imgs/玄翎.webp",
  "秧秧": "/character-imgs/秧秧.webp",
  "吟霖": "/character-imgs/吟霖.webp",
  "釉瑚": "/character-imgs/釉瑚.webp",
  "滑翔翼,翱翔翼,科考摩托": "/character-imgs/滑翔翼.webp",
  "渊武": "/character-imgs/渊武.webp",
  "赞妮": "/character-imgs/赞妮.webp",
  "折枝": "/character-imgs/折枝.webp",
  "景燃": "/character-imgs/景燃.webp",
  "清宵": "/character-imgs/清宵.webp",
  "穗穗": "/character-imgs/穗穗.webp",
  "锁暝": "/character-imgs/锁暝.webp",
  "心月狐": "/character-imgs/心月狐.webp",
} as const;

/**
 * 头像存储根地址。必须是 NEXT_PUBLIC_*，因为这个函数会被客户端组件调用；
 * 默认值就是当前公开预览桶（与卡片图同一个桶，浏览器可复用同一条 HTTP/2 连接）。
 */
const CHARACTER_AVATAR_BASE =
  process.env.NEXT_PUBLIC_CHARACTER_AVATAR_BASE?.trim().replace(/\/+$/, "") ||
  process.env.NEXT_PUBLIC_COS_IMAGE_BASE?.trim().replace(/\/+$/, "") ||
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com";

/** 根据角色名获取头像 URL，无头像时返回 null */
export function getCharacterImagePath(label: string): string | null {
  const localPath = characterImageMap[label];
  if (!localPath) return null;

  // 映射表里是 /character-imgs/<原文件名>；COS 键保留中文原名，只做 URL 编码
  const prefix = "/character-imgs/";
  if (!localPath.startsWith(prefix)) return localPath;

  const filename = localPath.slice(prefix.length);
  return `${CHARACTER_AVATAR_BASE}/character-imgs/${encodeURIComponent(filename)}`;
}
