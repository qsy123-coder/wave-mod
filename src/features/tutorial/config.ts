import type { TutorialConfig } from "./types";
import { tutorialConfigSchema } from "./types";

/**
 * 静态兜底教程。**由 scripts/sync-tutorial-fallback.mjs 生成，不要手改。**
 *
 * 真源是数据库（`tutorial_configs` / `tutorial_chapters`，后台 /admin/tutorial 编辑）。
 * 本文件在读库失败时兜底 —— 见 src/app/(site)/guide/page.tsx：listVisibleVersions()
 * 返回空数组时，用这里的内容充当一个伪版本。
 *
 * ⚠️ 「读库失败」不是罕见分支：Supabase 出口配额打满时 REST 网关一律 402，
 * 那时 /guide 渲染的**就是**这个文件。所以后台改完教程必须跟着跑一次生成脚本，
 * 否则前台在配额恢复前看不到任何变化。见 [[tutorial-static-fallback-sync]]。
 *
 * 内容镜像自库里 published 的 `launcher-update` 版本（启动器更新后教程，0 章 / 0 张图）。
 * 该版本没有图文章节（图文已下架、只留配套视频），所以 chapters 是空数组。
 */
const rawConfig: TutorialConfig = {
  title: "启动器更新后教程",
  subtitle: "先看我",
  imageBasePath: "/tutorial/",
  video: { src: "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/companion/4/tutorial.mp4", poster: "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/companion/4/poster.webp" },
  chapters: [

  ],
};

// Zod validates at module load time — catches config errors at build
export const tutorialConfig: TutorialConfig =
  tutorialConfigSchema.parse(rawConfig);
