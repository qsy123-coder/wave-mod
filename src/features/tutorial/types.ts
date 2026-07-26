import { z } from "zod";

// --- Tool entry for Chapter 00 ---
export const toolEntrySchema = z.object({
  name: z.string().min(1, "工具名称不能为空"),
  url: z.string().min(1, "链接不能为空"),
  description: z.string().optional(),
  required: z.boolean().optional(),
});
export type ToolEntry = z.infer<typeof toolEntrySchema>;

// --- Chapter definition ---
export const chapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(["text", "images"]),
  intro: z.string().optional(),
  images: z.array(z.string()).optional(),
  tools: z.array(toolEntrySchema).optional(),
});
export type Chapter = z.infer<typeof chapterSchema>;

// --- Full tutorial config ---
export const tutorialConfigSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  chapters: z.array(chapterSchema).min(1),
  imageBasePath: z.string(),
});
export type TutorialConfig = z.infer<typeof tutorialConfigSchema>;

// --- Resolved image (for component consumption) ---
export interface TutorialImageResolved {
  src: string;
  alt: string;
  chapterId: string;
  index: number;
}
