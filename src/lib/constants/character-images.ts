/**
 * 角色名 → 头像图片路径（对外入口）。
 *
 * 数据本体已搬到 `character-registry.ts`（与角色名单合并成唯一源头）。
 * 本文件保留原名导出与 `getCharacterImagePath`，因为 8 个组件都在 import 它。
 *
 * ⚠️ 加角色请改 `character-registry.ts` 的 CHARACTER_AVATARS，**不要**在这里加。
 */
import { CHARACTER_AVATARS } from "@/lib/constants/character-registry";

export const characterImageMap: Record<string, string> = CHARACTER_AVATARS;

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
