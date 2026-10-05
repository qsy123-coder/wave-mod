import { z } from "zod";

// --- Tool entry for Chapter 00 ---
export const cloudUrlsSchema = z.object({
  baidu: z.string().optional(),
  quark: z.string().optional(),
}).optional();
export type CloudUrls = z.infer<typeof cloudUrlsSchema>;

export const toolEntrySchema = z.object({
  name: z.string().min(1, "工具名称不能为空"),
  url: z.string().min(1, "链接不能为空"),
  description: z.string().optional(),
  required: z.boolean().optional(),
  cloudUrls: cloudUrlsSchema,
});
export type ToolEntry = z.infer<typeof toolEntrySchema>;

// --- Video config ---
export const videoConfigSchema = z.object({
  src: z.string().min(1, "视频路径不能为空"),
  poster: z.string().optional(),
});
export type VideoConfig = z.infer<typeof videoConfigSchema>;

// --- Chapter definition ---
export const chapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(["text", "images"]),
  intro: z.string().optional(),
  images: z.array(z.string()).optional(),
  tools: z.array(toolEntrySchema).optional(),
  video: videoConfigSchema.optional(),
});
export type Chapter = z.infer<typeof chapterSchema>;

// --- Full tutorial config ---
/**
 * chapters 现在**允许为空**：存在「图文下架、只留视频」的版本（如「启动器更新后」——
 * 启动器改版后旧图文不再适用，新图文还没做）。原先的 .min(1) 会把这类版本挡在
 * 构建期（config.ts 在模块加载时 parse），所以改成用 refine 守住真正该守的约束：
 * **图文和视频至少得有一样**，否则这个版本在页面上就是个空壳。
 */
export const tutorialConfigSchema = z
  .object({
    title: z.string(),
    subtitle: z.string(),
    chapters: z.array(chapterSchema),
    imageBasePath: z.string(),
    /** 页面级配套视频（整篇教程一个），与 chapter.video 的章节视频不同；没有时不渲染卡片 */
    video: videoConfigSchema.optional(),
  })
  .refine((c) => c.chapters.length > 0 || Boolean(c.video), {
    message: "教程至少要有图文章节或配套视频其中之一",
  });
export type TutorialConfig = z.infer<typeof tutorialConfigSchema>;

// --- Resolved image (for component consumption) ---
export interface TutorialImageResolved {
  src: string;
  alt: string;
  chapterId: string;
  index: number;
}

// --- Version metadata (for the /guide version switcher) ---
export interface TutorialVersionMeta {
  /** 版本 key，如 "default" */
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_visible: boolean;
  is_default: boolean;
}
