import { z } from "zod";

// ── Database row types (match Supabase table columns) ──

export type TutorialConfigStatus = "published" | "draft";

export interface TutorialVersionRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_visible: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TutorialConfigRow {
  /** id = '{versionKey}:{status}'，如 "default:published" */
  id: string;
  /** 所属版本 key（关联 tutorial_versions.id） */
  version_id: string;
  /** 'published' | 'draft' */
  status: TutorialConfigStatus;
  title: string;
  subtitle: string;
  image_base_path: string;
  updated_at: string;
}

export interface TutorialChapterRow {
  id: string;
  config_id: string;
  sort_order: number;
  chapter_key: string;
  title: string;
  type: "text" | "images";
  intro: string | null;
  video_src: string | null;
  video_poster: string | null;
  created_at: string;
  updated_at: string;
}

export interface TutorialImageRow {
  id: string;
  chapter_id: string;
  sort_order: number;
  url: string;
  filename: string;
  alt: string | null;
  created_at: string;
}

export interface TutorialToolRow {
  id: string;
  chapter_id: string;
  sort_order: number;
  name: string;
  url: string;
  description: string | null;
  required: boolean;
  cloud_baidu: string | null;
  cloud_quark: string | null;
  created_at: string;
}

// ── Aggregated read type (full tree for admin page / guide page) ──

export interface TutorialChapterFull extends TutorialChapterRow {
  images: TutorialImageRow[];
  tools: TutorialToolRow[];
}

export interface TutorialFullData {
  config: TutorialConfigRow;
  chapters: TutorialChapterFull[];
}

// ── Zod schemas for save-draft validation ──

export const saveToolSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number().int().min(0),
  name: z.string().min(1, "工具名称不能为空"),
  url: z.string().min(1, "下载链接不能为空"),
  description: z.string().optional(),
  required: z.boolean().optional(),
  cloud_baidu: z.string().optional(),
  cloud_quark: z.string().optional(),
});

export const saveImageSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number().int().min(0),
  url: z.string().min(1, "图片 URL 不能为空"),
  filename: z.string().min(1),
  alt: z.string().optional(),
});

export const saveChapterSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number().int().min(0),
  chapter_key: z
    .string()
    .min(1, "章节标识不能为空")
    .regex(/^\d{2}(-\d+)?$/, "章节标识必须为两位数字（如 00, 01）或包含子章节（如 03-1）"),
  title: z.string().min(1, "章节标题不能为空"),
  type: z.enum(["text", "images"]),
  intro: z.string().optional(),
  video_src: z.string().optional(),
  video_poster: z.string().optional(),
  images: z.array(saveImageSchema).optional(),
  tools: z.array(saveToolSchema).optional(),
});

export const saveConfigSchema = z.object({
  title: z.string().min(1, "教程标题不能为空"),
  subtitle: z.string().min(1, "副标题不能为空"),
  image_base_path: z.string().min(1, "图片路径不能为空"),
});

// ── Version metadata schema (create / update) ──

/** 版本 key 只用字母数字和连字符（避免与 ':' 分隔符冲突） */
const versionKeyRegex = /^[a-z0-9][a-z0-9-]*$/;

export const versionMetaSchema = z.object({
  /** 创建时可选；更新时不传（key 不可变） */
  id: z.string().optional(),
  name: z.string().min(1, "版本名称不能为空"),
  description: z.string().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_visible: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

export const versionKeySchema = z
  .string()
  .min(1, "版本 key 不能为空")
  .regex(versionKeyRegex, "版本 key 只能用小写字母/数字/连字符，且不能以连字符开头");

export type VersionMetaInput = z.infer<typeof versionMetaSchema>;

export const saveDraftInputSchema = z.object({
  config: saveConfigSchema,
  chapters: z
    .array(saveChapterSchema)
    .min(1, "至少需要一个章节")
    .max(20, "最多 20 个章节"),
});

export type SaveToolInput = z.infer<typeof saveToolSchema>;
export type SaveImageInput = z.infer<typeof saveImageSchema>;
export type SaveChapterInput = z.infer<typeof saveChapterSchema>;
export type SaveConfigInput = z.infer<typeof saveConfigSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
