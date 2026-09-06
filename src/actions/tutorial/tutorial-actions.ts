"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicReadClient } from "@/lib/supabase/server";
import { tutorialConfig } from "@/features/tutorial/config";
import { logger } from "@/lib/logger";
import type { Database } from "@/types/supabase";
import type {
  TutorialFullData,
  TutorialConfigRow,
  TutorialChapterFull,
} from "@/features/tutorial-admin/types";
import { saveDraftInputSchema, versionMetaSchema } from "@/features/tutorial-admin/types";
import type { SaveDraftInput, TutorialVersionRow, VersionMetaInput } from "@/features/tutorial-admin/types";
import type { TutorialVersionMeta } from "@/features/tutorial/types";

type DbClient = SupabaseClient<Database>;

// ── Helpers ──

/** config id = '{versionKey}:{status}' */
function configIdFor(versionId: string, status: "published" | "draft"): string {
  return `${versionId}:${status}`;
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

/** Fetch chapters with nested images + tools for a given config */
async function fetchChapters(
  supabase: DbClient,
  configId: string,
): Promise<TutorialChapterFull[]> {
  const { data: chapters, error } = await supabase
    .from("tutorial_chapters")
    .select(
      "*, images:tutorial_images(*), tools:tutorial_tools(*)",
    )
    .eq("config_id", configId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`读取章节失败：${error.message}`);

  return (chapters ?? []).map((ch) => {
    const record = ch as Record<string, unknown>;
    const images = (record.images as unknown[]) ?? [];
    const tools = (record.tools as unknown[]) ?? [];
    return {
      ...record,
      images: [...images].sort(
        (a, b) =>
          ((a as Record<string, unknown>).sort_order as number) -
          ((b as Record<string, unknown>).sort_order as number),
      ),
      tools: [...tools].sort(
        (a, b) =>
          ((a as Record<string, unknown>).sort_order as number) -
          ((b as Record<string, unknown>).sort_order as number),
      ),
    } as unknown as TutorialChapterFull;
  });
}

/** Read a full config tree (published or draft) for a given version */
async function readConfigTreeForVersion(
  supabase: DbClient,
  versionId: string,
  status: "published" | "draft",
): Promise<TutorialFullData | null> {
  const configId = configIdFor(versionId, status);
  const { data: config, error } = await supabase
    .from("tutorial_configs")
    .select("*")
    .eq("id", configId)
    .single();

  if (error || !config) return null;

  const chapters = await fetchChapters(supabase, configId);

  return {
    config: config as TutorialConfigRow,
    chapters,
  };
}

// ── Public read (used by guide page) ──

/** List visible versions (is_visible=true), sorted by sort_order. Default flag is exposed for the switcher.
 *  查询失败（如迁移 SQL 尚未执行、表不存在）时降级返回空数组，让 /guide 回退到 config.ts 静态教程。 */
export async function listVisibleVersions(): Promise<TutorialVersionMeta[]> {
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("tutorial_versions")
    .select("id, name, description, sort_order, is_visible, is_default")
    .eq("is_visible", true)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) {
    logger.warn("[tutorial] listVisibleVersions fallback to empty (schema may be unmigrated)", { error: error.message });
    return [];
  }

  const defaultFirst = (data ?? []).map(
    (row) => ({ ...row, is_default: row.is_default }) as TutorialVersionRow,
  );
  return defaultFirst.map(toVersionMeta);
}

/** Read a single version's published tutorial (content for /guide). Falls back to config.ts when no DB data. */
export async function getTutorialForVersion(versionId: string): Promise<TutorialFullData | null> {
  const supabase = createPublicReadClient();
  return readConfigTreeForVersion(supabase, versionId, "published");
}

/** Resolve which version to show: explicit choice > remembered > default > first visible. Returns null if none. */
export async function resolveDefaultVersion(): Promise<TutorialVersionMeta | null> {
  const versions = await listVisibleVersions();
  if (versions.length === 0) return null;
  return versions.find((v) => v.is_default) ?? versions[0];
}

// ── Admin read ──

export async function getDraftTutorial(versionId: string): Promise<TutorialFullData | null> {
  await requireAdminUser("/admin/tutorial");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");
  return readConfigTreeForVersion(supabase, versionId, "draft");
}

/** All versions (including hidden) with flags + their published/draft content. Used by the admin page. */
export async function getAdminTutorialData(): Promise<{
  versions: TutorialVersionRow[];
  published: TutorialFullData | null;
  draft: TutorialFullData | null;
}> {
  await requireAdminUser("/admin/tutorial");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { data: versions, error: vErr } = await supabase
    .from("tutorial_versions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (vErr) throw new Error(`读取版本列表失败：${vErr.message}`);

  // Read published/draft for every version in parallel
  const trees = await Promise.all(
    (versions ?? []).map(async (v) => {
      const [pub, drf] = await Promise.all([
        readConfigTreeForVersion(supabase, v.id, "published"),
        readConfigTreeForVersion(supabase, v.id, "draft"),
      ]);
      return { versionId: v.id, published: pub, draft: drf };
    }),
  );

  const first = trees[0];
  return {
    versions: (versions ?? []) as TutorialVersionRow[],
    published: first?.published ?? null,
    draft: first?.draft ?? null,
  };
}

/** Load one version's published + draft content for the admin editor. */
export async function getAdminVersionTrees(versionId: string): Promise<{
  published: TutorialFullData | null;
  draft: TutorialFullData | null;
}> {
  await requireAdminUser("/admin/tutorial");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const [published, draft] = await Promise.all([
    readConfigTreeForVersion(supabase, versionId, "published"),
    readConfigTreeForVersion(supabase, versionId, "draft"),
  ]);

  return { published, draft };
}

// ── Version CRUD ──

/** List all versions (admin) — full rows with flags */
export async function listAllVersions(): Promise<TutorialVersionRow[]> {
  await requireAdminUser("/admin/tutorial");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { data, error } = await supabase
    .from("tutorial_versions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`读取版本失败：${error.message}`);
  return (data ?? []) as TutorialVersionRow[];
}

/** Create a new version. Ensures only one version is marked default. */
export async function createVersion(input: VersionMetaInput): Promise<{ key: string }> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  // Generate a unique key from name, fall back to timestamp if collision
  let key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!key) key = "v";
  const { data: exists } = await supabase
    .from("tutorial_versions")
    .select("id")
    .eq("id", key)
    .maybeSingle();
  if (exists) {
    key = `${key}-${Date.now().toString(36)}`;
  }

  const { error } = await supabase.from("tutorial_versions").insert({
    id: key,
    name: input.name,
    description: input.description ?? null,
    sort_order: input.sort_order,
    is_visible: input.is_visible,
    is_default: input.is_default,
  });

  if (error) throw new Error(`创建版本失败：${error.message}`);

  if (input.is_default) await clearOtherDefaults(supabase, key);
  revalidatePath("/admin/tutorial");
  return { key };
}

/** Update a version's metadata (name / description / sort / visible / default). */
export async function updateVersionMeta(
  versionId: string,
  input: VersionMetaInput,
): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const parsed = versionMetaSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "版本数据无效");
  }

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { error } = await supabase
    .from("tutorial_versions")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sort_order: parsed.data.sort_order,
      is_visible: parsed.data.is_visible,
      is_default: parsed.data.is_default,
    })
    .eq("id", versionId);

  if (error) throw new Error(`保存版本失败：${error.message}`);

  if (parsed.data.is_default) await clearOtherDefaults(supabase, versionId);
  revalidatePath("/admin/tutorial");
}

/** Delete a version (cascades to its published/draft configs and their chapters). */
export async function deleteVersion(versionId: string): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { count } = await supabase
    .from("tutorial_versions")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) <= 1) {
    throw new Error("至少保留一个版本，不能删除最后一个。");
  }

  const { error } = await supabase
    .from("tutorial_versions")
    .delete()
    .eq("id", versionId);

  if (error) throw new Error(`删除版本失败：${error.message}`);

  revalidatePath("/admin/tutorial");
  revalidatePath("/guide");
}

/** When marking a version default, clear is_default on all others (service role bypasses RLS). */
async function clearOtherDefaults(supabase: DbClient, versionId: string): Promise<void> {
  await supabase
    .from("tutorial_versions")
    .update({ is_default: false })
    .neq("id", versionId)
    .eq("is_default", true);
}

// ── Save draft ──

export async function saveDraft(versionId: string, input: SaveDraftInput): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const parsed = saveDraftInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "保存数据无效");
  }

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { config, chapters } = parsed.data;
  const draftConfigId = configIdFor(versionId, "draft");

  // 1. Upsert draft config
  const { error: configError } = await supabase
    .from("tutorial_configs")
    .upsert(
      {
        id: draftConfigId,
        version_id: versionId,
        status: "draft",
        title: config.title,
        subtitle: config.subtitle,
        image_base_path: config.image_base_path,
      },
      { onConflict: "id" },
    );

  if (configError) throw new Error(`保存配置失败：${configError.message}`);

  // 2. Delete existing draft chapters (cascade deletes images/tools)
  const { error: deleteError } = await supabase
    .from("tutorial_chapters")
    .delete()
    .eq("config_id", draftConfigId);

  if (deleteError) throw new Error(`清理旧草稿失败：${deleteError.message}`);

  // 3. Insert chapters with nested images and tools
  for (const chapter of chapters) {
    const { data: inserted, error: chapterError } = await supabase
      .from("tutorial_chapters")
      .insert({
        config_id: draftConfigId,
        sort_order: chapter.sort_order,
        chapter_key: chapter.chapter_key,
        title: chapter.title,
        type: chapter.type,
        intro: chapter.intro ?? null,
        video_src: chapter.video_src ?? null,
        video_poster: chapter.video_poster ?? null,
      })
      .select("id")
      .single();

    if (chapterError || !inserted) {
      throw new Error(`保存章节失败：${chapterError?.message ?? "未知错误"}`);
    }

    const chapterId = inserted.id as string;

    // Insert images
    if (chapter.images && chapter.images.length > 0) {
      const { error: imgError } = await supabase.from("tutorial_images").insert(
        chapter.images.map((img) => ({
          chapter_id: chapterId,
          sort_order: img.sort_order,
          url: img.url,
          filename: img.filename,
          alt: img.alt ?? null,
        })),
      );
      if (imgError) throw new Error(`保存图片失败：${imgError.message}`);
    }

    // Insert tools
    if (chapter.tools && chapter.tools.length > 0) {
      const { error: toolError } = await supabase.from("tutorial_tools").insert(
        chapter.tools.map((tool) => ({
          chapter_id: chapterId,
          sort_order: tool.sort_order,
          name: tool.name,
          url: tool.url,
          description: tool.description ?? null,
          required: tool.required ?? false,
          cloud_baidu: tool.cloud_baidu ?? null,
          cloud_quark: tool.cloud_quark ?? null,
        })),
      );
      if (toolError) throw new Error(`保存工具失败：${toolError.message}`);
    }
  }

  revalidatePath("/admin/tutorial");
}

// ── Publish ──

export async function publishTutorial(versionId: string): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  // 1. Read draft for this version
  const draft = await readConfigTreeForVersion(supabase, versionId, "draft");
  if (!draft) throw new Error("没有草稿可发布，请先编辑并保存。");

  const publishedConfigId = configIdFor(versionId, "published");
  const draftConfigId = configIdFor(versionId, "draft");

  // 2. Delete published config (cascade deletes chapters/images/tools)
  await supabase.from("tutorial_configs").delete().eq("id", publishedConfigId);

  // 3. Insert published config
  const { error: pubError } = await supabase
    .from("tutorial_configs")
    .insert({
      id: publishedConfigId,
      version_id: versionId,
      status: "published",
      title: draft.config.title,
      subtitle: draft.config.subtitle,
      image_base_path: draft.config.image_base_path,
    });

  if (pubError) throw new Error(`发布配置失败：${pubError.message}`);

  // 4. Copy chapters with images and tools
  for (const chapter of draft.chapters) {
    const { data: inserted, error: chError } = await supabase
      .from("tutorial_chapters")
      .insert({
        config_id: publishedConfigId,
        sort_order: chapter.sort_order,
        chapter_key: chapter.chapter_key,
        title: chapter.title,
        type: chapter.type,
        intro: chapter.intro,
        video_src: chapter.video_src,
        video_poster: chapter.video_poster,
      })
      .select("id")
      .single();

    if (chError || !inserted) {
      throw new Error(`发布章节失败：${chError?.message ?? "未知错误"}`);
    }

    const newChapterId = inserted.id as string;

    // Copy images
    if (chapter.images.length > 0) {
      const { error: imgError } = await supabase.from("tutorial_images").insert(
        chapter.images.map((img) => ({
          chapter_id: newChapterId,
          sort_order: img.sort_order,
          url: img.url,
          filename: img.filename,
          alt: img.alt,
        })),
      );
      if (imgError) throw new Error(`发布图片失败：${imgError.message}`);
    }

    // Copy tools
    if (chapter.tools.length > 0) {
      const { error: toolError } = await supabase
        .from("tutorial_tools")
        .insert(
          chapter.tools.map((tool) => ({
            chapter_id: newChapterId,
            sort_order: tool.sort_order,
            name: tool.name,
            url: tool.url,
            description: tool.description,
            required: tool.required,
            cloud_baidu: tool.cloud_baidu,
            cloud_quark: tool.cloud_quark,
          })),
        );
      if (toolError) throw new Error(`发布工具失败：${toolError.message}`);
    }
  }

  // 5. Delete draft for this version
  await supabase.from("tutorial_configs").delete().eq("id", draftConfigId);

  revalidatePath("/guide");
  revalidatePath("/admin/tutorial");
}

// ── Discard draft ──

export async function discardDraft(versionId: string): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { error } = await supabase
    .from("tutorial_configs")
    .delete()
    .eq("id", configIdFor(versionId, "draft"));

  if (error) throw new Error(`放弃草稿失败：${error.message}`);

  revalidatePath("/admin/tutorial");
}

// ── Migration from config.ts ──

export async function migrateFromConfig(): Promise<{ migrated: boolean; count: number }> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  // Check if any version exists yet
  const { count } = await supabase
    .from("tutorial_versions")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    return { migrated: false, count: 0 };
  }

  // 0. Seed the default version
  await supabase.from("tutorial_versions").insert({
    id: "default",
    name: "默认版本",
    description: null,
    sort_order: 0,
    is_visible: true,
    is_default: true,
  });

  const publishedConfigId = "default:published";

  // Insert published config
  await supabase.from("tutorial_configs").upsert(
    {
      id: publishedConfigId,
      version_id: "default",
      status: "published",
      title: tutorialConfig.title,
      subtitle: tutorialConfig.subtitle,
      image_base_path: tutorialConfig.imageBasePath,
    },
    { onConflict: "id" },
  );

  // Insert chapters with images and tools
  for (const chapter of tutorialConfig.chapters) {
    const { data: inserted, error: chError } = await supabase
      .from("tutorial_chapters")
      .insert({
        config_id: publishedConfigId,
        sort_order: parseInt(chapter.id, 10),
        chapter_key: chapter.id,
        title: chapter.title,
        type: chapter.type,
        intro: chapter.intro ?? null,
        video_src: chapter.video?.src ?? null,
        video_poster: chapter.video?.poster ?? null,
      })
      .select("id")
      .single();

    if (chError || !inserted) {
      throw new Error(`迁移章节 ${chapter.id} 失败：${chError?.message ?? "未知错误"}`);
    }

    const chapterId = inserted.id as string;

    // Insert images
    if (chapter.images && chapter.images.length > 0) {
      await supabase.from("tutorial_images").insert(
        chapter.images.map((filename, i) => ({
          chapter_id: chapterId,
          sort_order: i,
          url: `${tutorialConfig.imageBasePath}${filename}`,
          filename,
        })),
      );
    }

    // Insert tools
    if (chapter.tools && chapter.tools.length > 0) {
      await supabase.from("tutorial_tools").insert(
        chapter.tools.map((tool, i) => ({
          chapter_id: chapterId,
          sort_order: i,
          name: tool.name,
          url: tool.url,
          description: tool.description ?? null,
          required: tool.required ?? false,
          cloud_baidu: tool.cloudUrls?.baidu ?? null,
          cloud_quark: tool.cloudUrls?.quark ?? null,
        })),
      );
    }
  }

  revalidatePath("/guide");
  revalidatePath("/admin/tutorial");

  return { migrated: true, count: tutorialConfig.chapters.length };
}

// ── Check if migration is needed ──

export async function needsMigration(): Promise<boolean> {
  const supabase = createPublicReadClient();
  const { count } = await supabase
    .from("tutorial_versions")
    .select("id", { count: "exact", head: true });

  return (count ?? 0) === 0;
}
