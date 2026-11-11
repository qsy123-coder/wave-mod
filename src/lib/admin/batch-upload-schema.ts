import { z } from "zod";

import { BATCH_DRIVE_PLATFORMS } from "@/lib/admin/batch-upload-types";

const driveLinkSchema = z.object({
  platform: z.enum(BATCH_DRIVE_PLATFORMS),
  url: z.url("网盘链接格式不正确"),
  // 同一帖子的多版本：夸克/迅雷链接各自带版本标签；普通批量导入不填
  variant: z.string().trim().min(1).max(40).optional(),
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
  editedFields: z.array(z.string()).max(20).default([]),
});

export const batchUploadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  rows: z.array(rowSchema).min(1, "至少选择一行").max(100, "单批最多 100 条"),
});

export type BatchUploadInput = z.infer<typeof batchUploadSchema>;
