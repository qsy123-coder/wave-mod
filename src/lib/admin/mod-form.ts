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
  downloadUrl: z.url("请输入有效的阿里云 OSS 直链"),
  videoUrl: z.union([z.literal(""), z.url("请输入有效的视频链接")]),
  authorUrl: z.union([z.literal(""), z.url("请输入有效的作者链接")]),
  imageUrls: z.string().trim().min(1, "请至少填写一张预览图链接"),
  tags: z.string().trim().optional().default(""),
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
    tags: String(formData.get("tags") ?? "").trim(),
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

export function splitTags(value: string) {
  return value ? value.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean) : [];
}
