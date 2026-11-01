"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";

import { execute, queryOne, queryRows, withTransaction } from "@/lib/db/query";
import { tutorialConfig } from "@/features/tutorial/config";
import { logger } from "@/lib/logger";
import type {
  TutorialFullData,
  TutorialConfigRow,
  TutorialChapterFull,
  TutorialChapterRow,
  TutorialImageRow,
  TutorialToolRow,
} from "@/features/tutorial-admin/types";
import { saveDraftInputSchema, versionMetaSchema } from "@/features/tutorial-admin/types";
import type { SaveDraftInput, TutorialVersionRow, VersionMetaInput } from "@/features/tutorial-admin/types";
import type { TutorialVersionMeta } from "@/features/tutorial/types";

// ── Helpers ──

/** config id = '{versionKey}:{status}' */
function configIdFor(versionId: string, status: "published" | "draft"): string {
  return `${versionId}:${status}`;
}

/**
 * 配套视频的两个字段：后台表单里「清空」表现为空串，写库要归一成 NULL。
 * 留成 '' 会让前台 `if (!config.video?.src)` 之外的判空写法（如 `!== null`）判断错误，
 * 且与「老版本没有配套视频」的 NULL 语义不一致。
 */
function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Map a version DB row to the frontend meta shape */
function toVersionMeta(row: TutorialVersionRow): TutorialVersionMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sort_order: row.sort_order,
    is_visible: row.is_visible,
    is_default: row.is_default,
  };
}

/** Fetch chapters with their images + tools for a given config. */
async function fetchChapters(configId: string): Promise<TutorialChapterFull[]> {
  const chapters = await queryRows<TutorialChapterRow>(
    `select *
       from public.tutorial_chapters
      where config_id = $1
      order by sort_order asc`,
    [configId],
  );

  if (chapters.length === 0) return [];

  const chapterIds = chapters.map((chapter) => chapter.id);
  const [images, tools] = await Promise.all([
    queryRows<TutorialImageRow>(
      `select *
         from public.tutorial_images
        where chapter_id = any($1::uuid[])
        order by sort_order asc`,
      [chapterIds],
    ),
    queryRows<TutorialToolRow>(
      `select *
         from public.tutorial_tools
        where chapter_id = any($1::uuid[])
        order by sort_order asc`,
      [chapterIds],
    ),
  ]);

  const imagesByChapter = new Map<string, TutorialImageRow[]>();
  for (const image of images) {
    const list = imagesByChapter.get(image.chapter_id);
    if (list) list.push(image);
    else imagesByChapter.set(image.chapter_id, [image]);
  }

  const toolsByChapter = new Map<string, TutorialToolRow[]>();
  for (const tool of tools) {
    const list = toolsByChapter.get(tool.chapter_id);
    if (list) list.push(tool);
    else toolsByChapter.set(tool.chapter_id, [tool]);
  }

  return chapters.map((chapter) => ({
    ...chapter,
    images: imagesByChapter.get(chapter.id) ?? [],
    tools: toolsByChapter.get(chapter.id) ?? [],
  }));
}

/** Read a full config tree (published or draft) for a given version. */
async function readConfigTreeForVersion(
  versionId: string,
  status: "published" | "draft",
): Promise<TutorialFullData | null> {
  const configId = configIdFor(versionId, status);
  const config = await queryOne<TutorialConfigRow>(
    "select * from public.tutorial_configs where id = $1",
    [configId],
  );

  if (!config) return null;

  const chapters = await fetchChapters(configId);

  return { config, chapters };
}

type ChapterInsertInput = {
  sort_order: number;
  chapter_key: string;
  title: string;
  type: string;
  intro?: string | null;
  video_src?: string | null;
  video_poster?: string | null;
  images?: {
    sort_order: number;
    url: string;
    filename: string;
    alt?: string | null;
  }[];
  tools?: {
    sort_order: number;
    name: string;
    url: string;
    description?: string | null;
    required?: boolean;
    cloud_baidu?: string | null;
    cloud_quark?: string | null;
  }[];
};

/** Insert one chapter and its images/tools inside an existing transaction. */
async function insertChapterTree(
  client: PoolClient,
  configId: string,
  chapter: ChapterInsertInput,
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `insert into public.tutorial_chapters
       (config_id, sort_order, chapter_key, title, type, intro, video_src, video_poster)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      configId,
      chapter.sort_order,
      chapter.chapter_key,
      chapter.title,
      chapter.type,
      chapter.intro ?? null,
      chapter.video_src ?? null,
      chapter.video_poster ?? null,
    ],
  );

  const chapterId = inserted.rows[0]?.id;

  if (!chapterId) {
    throw new Error(`保存章节失败：${chapter.chapter_key}`);
  }

  for (const image of chapter.images ?? []) {
    await client.query(
      `insert into public.tutorial_images
         (chapter_id, sort_order, url, filename, alt)
       values ($1, $2, $3, $4, $5)`,
      [chapterId, image.sort_order, image.url, image.filename, image.alt ?? null],
    );
  }

  for (const tool of chapter.tools ?? []) {
    await client.query(
      `insert into public.tutorial_tools
         (chapter_id, sort_order, name, url, description, required, cloud_baidu, cloud_quark)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        chapterId,
        tool.sort_order,
        tool.name,
        tool.url,
        tool.description ?? null,
        tool.required ?? false,
        tool.cloud_baidu ?? null,
        tool.cloud_quark ?? null,
      ],
    );
  }
}

// ── Public read (used by guide page) ──

/** List visible versions (is_visible=true), sorted by sort_order. Default flag is exposed for the switcher.
 *  查询失败（如迁移 SQL 尚未执行、表不存在）时降级返回空数组，让 /guide 回退到 config.ts 静态教程。 */
export async function listVisibleVersions(): Promise<TutorialVersionMeta[]> {
  try {
    const rows = await queryRows<TutorialVersionRow>(
      `select id, name, description, sort_order, is_visible, is_default
         from public.tutorial_versions
        where is_visible = true
        order by is_default desc, sort_order asc`,
    );

    return rows.map(toVersionMeta);
  } catch (error) {
    logger.warn("[tutorial] listVisibleVersions fallback to empty (schema may be unmigrated)", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

/** Read a single version's published tutorial (content for /guide). Falls back to config.ts when no DB data. */
export async function getTutorialForVersion(versionId: string): Promise<TutorialFullData | null> {
  return readConfigTreeForVersion(versionId, "published");
}

/** Resolve which version to show: explicit choice > remembered > default > first visible. Returns null if none. */
export async function resolveDefaultVersion(): Promise<TutorialVersionMeta | null> {
  const versions = await listVisibleVersions();
  if (versions.length === 0) return null;
  return versions.find((v) => v.is_default) ?? versions[0];
}

// ── Admin read ──

export async function getDraftTutorial(versionId: string): Promise<TutorialFullData | null> {
  return readConfigTreeForVersion(versionId, "draft");
}

/** All versions (including hidden) with flags + their published/draft content. Used by the admin page. */
export async function getAdminTutorialData(): Promise<{
  versions: TutorialVersionRow[];
  published: TutorialFullData | null;
  draft: TutorialFullData | null;
}> {

  const versions = await queryRows<TutorialVersionRow>(
    "select * from public.tutorial_versions order by sort_order asc",
  );

  // Read published/draft for every version in parallel
  const trees = await Promise.all(
    versions.map(async (version) => {
      const [published, draft] = await Promise.all([
        readConfigTreeForVersion(version.id, "published"),
        readConfigTreeForVersion(version.id, "draft"),
      ]);
      return { versionId: version.id, published, draft };
    }),
  );

  const first = trees[0];
  return {
    versions,
    published: first?.published ?? null,
    draft: first?.draft ?? null,
  };
}

/** Load one version's published + draft content for the admin editor. */
export async function getAdminVersionTrees(versionId: string): Promise<{
  published: TutorialFullData | null;
  draft: TutorialFullData | null;
}> {

  const [published, draft] = await Promise.all([
    readConfigTreeForVersion(versionId, "published"),
    readConfigTreeForVersion(versionId, "draft"),
  ]);

  return { published, draft };
}

// ── Version CRUD ──

/** List all versions (admin) — full rows with flags */
export async function listAllVersions(): Promise<TutorialVersionRow[]> {

  try {
    return await queryRows<TutorialVersionRow>(
      "select * from public.tutorial_versions order by sort_order asc",
    );
  } catch (error) {
    throw new Error(`读取版本失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/** Create a new version. Ensures only one version is marked default. */
export async function createVersion(input: VersionMetaInput): Promise<{ key: string }> {

  // Generate a unique key from name, fall back to timestamp if collision
  let key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!key) key = "v";

  const exists = await queryOne<{ id: string }>(
    "select id from public.tutorial_versions where id = $1",
    [key],
  );

  if (exists) {
    key = `${key}-${Date.now().toString(36)}`;
  }

  try {
    await execute(
      `insert into public.tutorial_versions
         (id, name, description, sort_order, is_visible, is_default)
       values ($1, $2, $3, $4, $5, $6)`,
      [key, input.name, input.description ?? null, input.sort_order, input.is_visible, input.is_default],
    );
  } catch (error) {
    throw new Error(`创建版本失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  if (input.is_default) await clearOtherDefaults(key);
  revalidatePath("/admin/tutorial");
  return { key };
}

/** Update a version's metadata (name / description / sort / visible / default). */
export async function updateVersionMeta(
  versionId: string,
  input: VersionMetaInput,
): Promise<void> {

  const parsed = versionMetaSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "版本数据无效");
  }

  try {
    await execute(
      `update public.tutorial_versions
          set name = $1,
              description = $2,
              sort_order = $3,
              is_visible = $4,
              is_default = $5
        where id = $6`,
      [
        parsed.data.name,
        parsed.data.description ?? null,
        parsed.data.sort_order,
        parsed.data.is_visible,
        parsed.data.is_default,
        versionId,
      ],
    );
  } catch (error) {
    throw new Error(`保存版本失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  if (parsed.data.is_default) await clearOtherDefaults(versionId);
  revalidatePath("/admin/tutorial");
}

/** Delete a version (cascades to its published/draft configs and their chapters). */
export async function deleteVersion(versionId: string): Promise<void> {

  const row = await queryOne<{ count: number }>(
    "select count(*)::int as count from public.tutorial_versions",
  );

  if ((row?.count ?? 0) <= 1) {
    throw new Error("至少保留一个版本，不能删除最后一个。");
  }

  try {
    await execute("delete from public.tutorial_versions where id = $1", [versionId]);
  } catch (error) {
    throw new Error(`删除版本失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePath("/admin/tutorial");
  revalidatePath("/guide");
}

/** When marking a version default, clear is_default on all others. */
async function clearOtherDefaults(versionId: string): Promise<void> {
  await execute(
    "update public.tutorial_versions set is_default = false where id <> $1 and is_default = true",
    [versionId],
  );
}

// ── Save draft ──

export async function saveDraft(versionId: string, input: SaveDraftInput): Promise<void> {

  const parsed = saveDraftInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "保存数据无效");
  }

  const { config, chapters } = parsed.data;
  const draftConfigId = configIdFor(versionId, "draft");

  // 整个草稿替换放在一个事务里：原实现是「upsert 配置 → 删章节 → 逐条插入」，
  // 中途失败会留下半截草稿，后台再打开就与刚才保存的内容不一致。
  try {
    await withTransaction(async (client) => {
      await client.query(
        `insert into public.tutorial_configs
           (id, version_id, status, title, subtitle, image_base_path, video_src, video_poster)
         values ($1, $2, 'draft', $3, $4, $5, $6, $7)
         on conflict (id) do update set
           version_id = excluded.version_id,
           status = excluded.status,
           title = excluded.title,
           subtitle = excluded.subtitle,
           image_base_path = excluded.image_base_path,
           video_src = excluded.video_src,
           video_poster = excluded.video_poster`,
        [
          draftConfigId,
          versionId,
          config.title,
          config.subtitle,
          config.image_base_path,
          nullIfBlank(config.video_src),
          nullIfBlank(config.video_poster),
        ],
      );

      // 级联删除章节下的图片与工具（FK on delete cascade）
      await client.query("delete from public.tutorial_chapters where config_id = $1", [
        draftConfigId,
      ]);

      for (const chapter of chapters) {
        await insertChapterTree(client, draftConfigId, {
          sort_order: chapter.sort_order,
          chapter_key: chapter.chapter_key,
          title: chapter.title,
          type: chapter.type,
          intro: chapter.intro ?? null,
          video_src: chapter.video_src ?? null,
          video_poster: chapter.video_poster ?? null,
          images: chapter.images,
          tools: chapter.tools,
        });
      }
    });
  } catch (error) {
    throw new Error(`保存草稿失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePath("/admin/tutorial");
}

// ── Publish ──

export async function publishTutorial(versionId: string): Promise<void> {

  // 1. Read draft for this version
  const draft = await readConfigTreeForVersion(versionId, "draft");
  if (!draft) throw new Error("没有草稿可发布，请先编辑并保存。");

  const publishedConfigId = configIdFor(versionId, "published");
  const draftConfigId = configIdFor(versionId, "draft");

  try {
    await withTransaction(async (client) => {
      // 2. Delete published config (cascade deletes chapters/images/tools)
      await client.query("delete from public.tutorial_configs where id = $1", [publishedConfigId]);

      // 3. Insert published config
      await client.query(
        `insert into public.tutorial_configs
           (id, version_id, status, title, subtitle, image_base_path, video_src, video_poster)
         values ($1, $2, 'published', $3, $4, $5, $6, $7)`,
        [
          publishedConfigId,
          versionId,
          draft.config.title,
          draft.config.subtitle,
          draft.config.image_base_path,
          // 显式复制视频字段：漏掉会让配套视频在每次发布时被静默清空。
          draft.config.video_src ?? null,
          draft.config.video_poster ?? null,
        ],
      );

      // 4. Copy chapters with images and tools
      for (const chapter of draft.chapters) {
        await insertChapterTree(client, publishedConfigId, {
          sort_order: chapter.sort_order,
          chapter_key: chapter.chapter_key,
          title: chapter.title,
          type: chapter.type,
          intro: chapter.intro,
          video_src: chapter.video_src,
          video_poster: chapter.video_poster,
          images: chapter.images,
          tools: chapter.tools,
        });
      }

      // 5. Delete draft for this version
      await client.query("delete from public.tutorial_configs where id = $1", [draftConfigId]);
    });
  } catch (error) {
    throw new Error(`发布教程失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePath("/guide");
  revalidatePath("/admin/tutorial");
}

// ── Discard draft ──

export async function discardDraft(versionId: string): Promise<void> {

  try {
    await execute("delete from public.tutorial_configs where id = $1", [
      configIdFor(versionId, "draft"),
    ]);
  } catch (error) {
    throw new Error(`放弃草稿失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePath("/admin/tutorial");
}

// ── Migration from config.ts ──

export async function migrateFromConfig(): Promise<{ migrated: boolean; count: number }> {

  const existing = await queryOne<{ count: number }>(
    "select count(*)::int as count from public.tutorial_versions",
  );

  if ((existing?.count ?? 0) > 0) {
    return { migrated: false, count: 0 };
  }

  const publishedConfigId = "default:published";

  try {
    await withTransaction(async (client) => {
      // 0. Seed the default version
      await client.query(
        `insert into public.tutorial_versions
           (id, name, description, sort_order, is_visible, is_default)
         values ('default', '默认版本', null, 0, true, true)`,
      );

      // Insert published config
      await client.query(
        `insert into public.tutorial_configs
           (id, version_id, status, title, subtitle, image_base_path, video_src, video_poster)
         values ($1, 'default', 'published', $2, $3, $4, $5, $6)`,
        [
          publishedConfigId,
          tutorialConfig.title,
          tutorialConfig.subtitle,
          tutorialConfig.imageBasePath,
          tutorialConfig.video?.src ?? null,
          tutorialConfig.video?.poster ?? null,
        ],
      );

      // Insert chapters with images and tools
      for (const chapter of tutorialConfig.chapters) {
        await insertChapterTree(client, publishedConfigId, {
          sort_order: parseInt(chapter.id, 10),
          chapter_key: chapter.id,
          title: chapter.title,
          type: chapter.type,
          intro: chapter.intro ?? null,
          video_src: chapter.video?.src ?? null,
          video_poster: chapter.video?.poster ?? null,
          images: (chapter.images ?? []).map((filename, index) => ({
            sort_order: index,
            url: `${tutorialConfig.imageBasePath}${filename}`,
            filename,
          })),
          tools: (chapter.tools ?? []).map((tool, index) => ({
            sort_order: index,
            name: tool.name,
            url: tool.url,
            description: tool.description ?? null,
            required: tool.required ?? false,
            cloud_baidu: tool.cloudUrls?.baidu ?? null,
            cloud_quark: tool.cloudUrls?.quark ?? null,
          })),
        });
      }
    });
  } catch (error) {
    throw new Error(`迁移教程失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePath("/guide");
  revalidatePath("/admin/tutorial");

  return { migrated: true, count: tutorialConfig.chapters.length };
}

// ── Check if migration is needed ──

export async function needsMigration(): Promise<boolean> {
  try {
    const row = await queryOne<{ count: number }>(
      "select count(*)::int as count from public.tutorial_versions",
    );
    return (row?.count ?? 0) === 0;
  } catch {
    return true;
  }
}
