// 按库里「前台实际展示的那个版本」重生成 src/features/tutorial/config.ts
// 用法: node scripts/sync-tutorial-fallback.mjs [--check]
//
// ⚠️ 兜底是**在被真的用到**的：Supabase 出口配额打满时 REST 网关一律 402，
// listVisibleVersions() 返回空数组，这时 /guide 渲染的就是这个文件
// （见 [[tutorial-static-fallback-sync]]）。改完教程别只改库 —— 不跑这个脚本，
// 前台在配额恢复前看不到任何变化。
import { resolve } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { config } from "dotenv";
import { psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

/**
 * 兜底要镜像的是「前台当前实际展示的版本」，即 is_visible + is_default 的那个。
 *
 * 这里曾经硬编码 'v'（新版教程）。「启动器更新后」上线、v 被下架后，硬编码会把
 * 已经下架的旧图文又写回兜底 —— 而兜底正是配额打满时唯一被渲染的东西，等于
 * 「下架」下架了个寂寞。所以改成从库里解析，前后端认同一个版本。
 */
const versionRow = await psqlJson(
  `select json_build_object('id', (
     select id from public.tutorial_versions
      where is_visible and is_default
      order by sort_order, id limit 1
   ))::text;`,
);
const VERSION_ID = versionRow?.id;

if (!VERSION_ID) {
  console.error("❌ 库里找不到 is_visible + is_default 的版本，无法确定该镜像哪一份");
  process.exit(1);
}
console.log(`镜像版本：${VERSION_ID}`);

const sql = `
select json_build_object(
  'config', (
    select json_build_object(
      'title', title, 'subtitle', subtitle, 'base', image_base_path,
      'video_src', video_src, 'video_poster', video_poster
    )
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
      'video_poster', ch.video_poster,
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

/**
 * 渲染 video 字面量。没有 src 就不输出这一项（= 该版本/该章没有视频）；
 * poster 单独判空，不能写成 `poster: undefined` 或空串 —— 前者会破坏「可选」的语义，
 * 后者（poster=""）会让浏览器跑到当前页面地址去取封面图。
 */
function renderVideo(src, poster) {
  if (!src) return null;
  return poster ? `{ src: ${lit(src)}, poster: ${lit(poster)} }` : `{ src: ${lit(src)} }`;
}

function renderChapter(ch) {
  const lines = [];
  lines.push("    {");
  lines.push(`      id: ${lit(ch.key)},`);
  lines.push(`      title: ${lit(ch.title)},`);
  lines.push(`      type: ${lit(ch.type)},`);
  if (ch.intro) lines.push(`      intro: ${lit(ch.intro)},`);
  const chapterVideo = renderVideo(ch.video, ch.video_poster);
  if (chapterVideo) lines.push(`      video: ${chapterVideo},`);
  if (ch.images?.length) {
    lines.push("      images: [");
    for (const url of ch.images) lines.push(`        ${lit(url)},`);
    lines.push("      ],");
  }
  lines.push("    },");
  return lines.join("\n");
}

const totalImages = data.chapters.reduce((n, c) => n + (c.images?.length ?? 0), 0);

// 顶层也是可选的：库里该版本没配配套视频就整行不输出
const configVideo = renderVideo(data.config.video_src, data.config.video_poster);
const configVideoLine = configVideo ? `  video: ${configVideo},\n` : "";

const out = `import type { TutorialConfig } from "./types";
import { tutorialConfigSchema } from "./types";

/**
 * 静态兜底教程。**由 scripts/sync-tutorial-fallback.mjs 生成，不要手改。**
 *
 * 真源是数据库（\`tutorial_configs\` / \`tutorial_chapters\`，后台 /admin/tutorial 编辑）。
 * 本文件在读库失败时兜底 —— 见 src/app/(site)/guide/page.tsx：listVisibleVersions()
 * 返回空数组时，用这里的内容充当一个伪版本。
 *
 * ⚠️ 「读库失败」不是罕见分支：Supabase 出口配额打满时 REST 网关一律 402，
 * 那时 /guide 渲染的**就是**这个文件。所以后台改完教程必须跟着跑一次生成脚本，
 * 否则前台在配额恢复前看不到任何变化。见 [[tutorial-static-fallback-sync]]。
 *
 * 内容镜像自库里 published 的 \`${VERSION_ID}\` 版本（${data.config.title}，${data.chapters.length} 章 / ${totalImages} 张图）。${totalImages > 0 ? `
 * 图片用 COS 绝对地址（与库内 url 列一致），不要改成本地文件名 —— 本地没有这些图。` : `
 * 该版本没有图文章节（图文已下架、只留配套视频），所以 chapters 是空数组。`}
 */
const rawConfig: TutorialConfig = {
  title: ${lit(data.config.title)},
  subtitle: ${lit(data.config.subtitle)},
  imageBasePath: ${lit(data.config.base)},
${configVideoLine}  chapters: [
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
