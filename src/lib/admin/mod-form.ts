import { z } from "zod";

import { defaultGameKey, games } from "@/config/games";

const gameKeySchema = z.enum(games.map((game) => game.key) as [string, ...string[]]);

export type AdminModFormState = {
  error: string;
  fieldErrors: Record<string, string>;
  success: string;
};

export const initialAdminModFormState: AdminModFormState = {
  error: "",
  fieldErrors: {},
  success: "",
};

export const adminModFormSchema = z.object({
  title: z.string().trim().min(2, "标题至少 2 个字"),
  gameKey: gameKeySchema.default(defaultGameKey),
  character: z.string().trim().min(1, "请输入角色名称"),
  description: z.string().trim().min(10, "描述至少 10 个字"),
  downloadUrl: z.union([z.literal(""), z.url("请输入有效的直链下载地址")]),
  videoUrl: z.union([z.literal(""), z.url("请输入有效的视频链接")]),
  authorUrl: z.union([z.literal(""), z.url("请输入有效的作者链接")]),
  imageUrls: z.string().trim().min(1, "请至少填写一张预览图链接"),
  driveLinksText: z.string().trim().optional().default(""),
  nsfw: z.boolean(),
  xxmiGuide: z.string().trim().min(1, "请填写 XXMI 安装说明"),
});

export const adminModUpdateFormSchema = adminModFormSchema.extend({
  id: z.uuid("无效的 MOD ID。"),
});

export type AdminModFormValues = z.input<typeof adminModFormSchema>;
export type ParsedAdminModFormValues = z.output<typeof adminModFormSchema>;
export type ParsedAdminModUpdateFormValues = z.output<typeof adminModUpdateFormSchema>;

export function buildAdminModFieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    Object.entries(z.flattenError(error).fieldErrors).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value[0] ?? "字段填写有误") : "字段填写有误",
    ]),
  );
}

export function parseAdminModFormData(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    gameKey: String(formData.get("gameKey") ?? defaultGameKey),
    character: String(formData.get("character") ?? ""),
    description: String(formData.get("description") ?? ""),
    downloadUrl: String(formData.get("downloadUrl") ?? ""),
    videoUrl: String(formData.get("videoUrl") ?? "").trim(),
    authorUrl: String(formData.get("authorUrl") ?? "").trim(),
    imageUrls: String(formData.get("imageUrls") ?? ""),
    driveLinksText: String(formData.get("driveLinksText") ?? ""),
    nsfw: formData.get("nsfw") === "on",
    xxmiGuide: String(formData.get("xxmiGuide") ?? ""),
  };
}

export function parseAdminModUpdateFormData(formData: FormData) {
  return {
    id: String(formData.get("id") ?? ""),
    ...parseAdminModFormData(formData),
  };
}

export function splitImageUrls(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 后台编辑表单里一行网盘链接的解析结果 */
export type ParsedDriveLink = { platform: string; url: string; variant?: string };

/**
 * 解析网盘链接文本。两种行格式：
 *
 *   夸克网盘 https://pan.quark.cn/s/xxxx          ← 历史格式，无变体
 *   Slim SFW | 夸克网盘 https://pan.quark.cn/s/x  ← 同一帖子的多版本
 *
 * 只切第一个竖线（全角 `｜` 也认），标签里可以带空格；`#` 开头的行是注释。
 * 行格式不合法时整行丢弃（与旧实现一致，不猜 URL）。
 */
export function splitDriveLinks(value: string): ParsedDriveLink[] {
  return value
    .split(/\r?\n/)
    .map((raw) => {
      let line = raw.trim();
      if (!line || line.startsWith("#")) return null;

      // 变体标签与「平台 链接」之间用竖线分隔；全角竖线在中文输入法下很常见
      const half = line.indexOf("|");
      const full = line.indexOf("｜");
      const separator = half === -1 ? full : full === -1 ? half : Math.min(half, full);

      let variant: string | undefined;
      if (separator !== -1) {
        variant = line.slice(0, separator).trim() || undefined;
        line = line.slice(separator + 1).trim();
      }

      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return null;
      const url = parts.pop()!;
      const platform = parts.join(" ").trim();
      if (!platform || !url) return null;

      return variant ? { platform, url, variant } : { platform, url };
    })
    .filter((item): item is ParsedDriveLink => item !== null);
}

/** 单行回填格式，与 `splitDriveLinks` 互为逆运算 */
export function formatDriveLink(link: ParsedDriveLink): string {
  const platform = String(link.platform ?? "").trim();
  const url = String(link.url ?? "").trim();
  const variant = String(link.variant ?? "").trim();
  return variant ? `${variant} | ${platform} ${url}` : `${platform} ${url}`;
}

export function formatDriveLinksText(links: readonly ParsedDriveLink[]): string {
  return links.map(formatDriveLink).join("\n");
}

