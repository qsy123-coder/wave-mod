import { z } from "zod";

import { BATCH_DRIVE_PLATFORMS } from "@/lib/admin/batch-upload-types";

/**
 * 变体标签上限。
 *
 * 标签来自 `deriveVariantLabel`：文件名里能剥掉帖子标题和作者时，剩下的就是
 * `Slim SFW` 这种短词；剥不掉时（标题是中文、文件名是英文，或附件名本身就很长）
 * 整段文件名都会成为标签。2026-11-26 的 `Hsin - Swan Glimpse - Num066-ultimate-v111`
 * 是 42 字符，撞上原来的 40 就整批提交失败 —— 这条限制没有业务含义，纯属展示文本，
 * 放宽到与标题同量级即可。
 */
export const MAX_VARIANT_LABEL_LENGTH = 200;

const variantLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_VARIANT_LABEL_LENGTH, `版本标签最长 ${MAX_VARIANT_LABEL_LENGTH} 字符`);

const driveLinkSchema = z.object({
  platform: z.enum(BATCH_DRIVE_PLATFORMS),
  url: z.url("网盘链接格式不正确"),
  // 同一帖子的多版本：夸克/迅雷链接各自带版本标签；普通批量导入不填
  variant: variantLabelSchema.optional(),
});

const rowSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(300, "标题过长"),
  character: z.string().trim().min(1, "角色不能为空").max(100, "角色过长"),
  version: z.string().trim().max(100).default("未标注"),
  gameVersion: z.string().trim().max(100).default("未标注"),
  description: z.string().trim().min(1, "简介不能为空").max(2000, "简介过长"),
  nsfw: z.boolean().default(false),
  driveLinks: z.array(driveLinkSchema).min(1, "至少需要一个网盘链接").max(10),
  images: z.array(z.url("图片地址格式不正确")).max(20).default([]),
  // 同帖多版本：标签 → 该变体画廊。普通行不填。
  // 键必须和 driveLinks[].variant 用同一个上限，否则卡片能建、图却写不进去
  variantImages: z
    .record(variantLabelSchema, z.array(z.url("图片地址格式不正确")).max(20))
    .default({}),
  editedFields: z.array(z.string()).max(20).default([]),
});

export const batchUploadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  rows: z.array(rowSchema).min(1, "至少选择一行").max(100, "单批最多 100 条"),
});

export type BatchUploadInput = z.infer<typeof batchUploadSchema>;
