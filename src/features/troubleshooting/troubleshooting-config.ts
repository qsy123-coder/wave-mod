import { z } from "zod";

export const troubleshootingCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  mdFile: z.string(),
  order: z.number(),
  questionCount: z.number(),
});

export type TroubleshootingCategory = z.infer<typeof troubleshootingCategorySchema>;

export const troubleshootingConfigSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  categories: z.array(troubleshootingCategorySchema).min(1),
});

export const troubleshootingConfig: TroubleshootingConfig = troubleshootingConfigSchema.parse({
  title: "问题解答",
  subtitle: "鸣潮 Mod 常见问题排查指南",
  categories: [
    { key: "installation", label: "安装与更新", mdFile: "01-installation.md", order: 1, questionCount: 4 },
    { key: "crashes", label: "启动与闪退", mdFile: "02-crashes.md", order: 2, questionCount: 6 },
    { key: "models", label: "模型与贴图", mdFile: "03-models.md", order: 3, questionCount: 9 },
    { key: "loading", label: "Mod 加载与生效", mdFile: "04-loading.md", order: 4, questionCount: 5 },
    { key: "management", label: "Mod 管理与配置", mdFile: "05-management.md", order: 5, questionCount: 8 },
    { key: "performance", label: "性能与其他", mdFile: "06-performance.md", order: 6, questionCount: 3 },
  ],
} satisfies TroubleshootingConfig);

export type TroubleshootingConfig = z.infer<typeof troubleshootingConfigSchema>;
