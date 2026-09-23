// 一次性脚本：按库里 published 的 'v'（新版教程）重生成 src/features/tutorial/config.ts
// 用法: node scripts/_tmp-gen-tutorial-config.mjs [--check]
import { resolve } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { config } from "dotenv";
import { psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const VERSION_ID = "v";

const sql = `
select json_build_object(
  'config', (
    select json_build_object('title', title, 'subtitle', subtitle, 'base', image_base_path)
    from public.tutorial_configs
    where version_id = '${VERSION_ID}' and status = 'published'
  ),
  'chapters', (
    select coalesce(json_agg(json_build_object(
      'key', ch.chapter_key,
      'title', ch.title,
      'type', ch.type,
      'intro', ch.intro,
      'video', ch.video_src,
      'images', (
        select coalesce(json_agg(i.url order by i.sort_order, i.filename), '[]'::json)
        from public.tutorial_images i where i.chapter_id = ch.id
      )
    ) order by ch.sort_order), '[]'::json)
    from public.tutorial_chapters ch
    join public.tutorial_configs c on c.id = ch.config_id
    where c.version_id = '${VERSION_ID}' and c.status = 'published'
  )
)::text;
`;

const data = await psqlJson(sql);
if (!data?.config) {
  console.error("❌ 库里没有找到该版本的 published 配置");
  process.exit(1);
}

/** TS 字面量：JSON.stringify 已能正确转义引号/反斜杠/中文 */
const lit = (v) => JSON.stringify(v);

function renderChapter(ch) {
  const lines = [];
  lines.push("    {");
  lines.push(`      id: ${lit(ch.key)},`);
  lines.push(`      title: ${lit(ch.title)},`);
  lines.push(`      type: ${lit(ch.type)},`);
  if (ch.intro) lines.push(`      intro: ${lit(ch.intro)},`);
  if (ch.video) lines.push(`      video: { src: ${lit(ch.video)} },`);
  if (ch.images?.length) {
    lines.push("      images: [");
    for (const url of ch.images) lines.push(`        ${lit(url)},`);
    lines.push("      ],");
  }
  lines.push("    },");
  return lines.join("\n");
}

const totalImages = data.chapters.reduce((n, c) => n + (c.images?.length ?? 0), 0);

const out = `import type { TutorialConfig } from "./types";
import { tutorialConfigSchema } from "./types";

/**
 * 静态兜底教程。
 *
 * 真源是数据库（\`tutorial_configs\` / \`tutorial_chapters\`，后台 /admin/tutorial 编辑），
 * 本文件只在 **读库失败** 时兜底渲染 —— 见 src/app/(site)/guide/page.tsx：
 * listVisibleVersions() 返回空数组时，用这里的内容充当一个伪版本，保证页面不空白。
 *
 * ⚠️ 内容镜像自库里 published 的 \`${VERSION_ID}\` 版本（${data.config.title}，${data.chapters.length} 章 / ${totalImages} 张图），
 * 图片用 COS 绝对地址（与库内 url 列一致），不要改成本地文件名 —— 本地没有这些图。
 * 后台改完教程后，这里不会自动同步；兜底内容需要跟着更新时，重新生成本文件。
 */
const rawConfig: TutorialConfig = {
  title: ${lit(data.config.title)},
  subtitle: ${lit(data.config.subtitle)},
  imageBasePath: ${lit(data.config.base)},
  chapters: [
${data.chapters.map(renderChapter).join("\n")}
  ],
};

// Zod validates at module load time — catches config errors at build
export const tutorialConfig: TutorialConfig =
  tutorialConfigSchema.parse(rawConfig);
`;

const target = resolve(process.cwd(), "src/features/tutorial/config.ts");
if (process.argv.includes("--check")) {
  const same = existsSync(target) && readFileSync(target, "utf8") === out;
  console.log(same ? "✅ 已是最新" : "⚠️ 与库里不一致");
  process.exit(same ? 0 : 1);
}

writeFileSync(target, out, "utf8");
console.log(`✅ 已写入 ${target}（${data.chapters.length} 章 / ${totalImages} 张图）`);
