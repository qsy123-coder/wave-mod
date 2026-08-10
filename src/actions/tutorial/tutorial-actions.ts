"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicReadClient } from "@/lib/supabase/server";
import { tutorialConfig } from "@/features/tutorial/config";
import type { Database } from "@/types/supabase";
import type {
  TutorialFullData,
  TutorialConfigRow,
  TutorialChapterFull,
} from "@/features/tutorial-admin/types";
import { saveDraftInputSchema } from "@/features/tutorial-admin/types";
import type { SaveDraftInput } from "@/features/tutorial-admin/types";

type DbClient = SupabaseClient<Database>;

// ── Helpers ──

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

/** Read a full config tree (published or draft) */
async function readConfigTree(
  supabase: DbClient,
  configId: string,
): Promise<TutorialFullData | null> {
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

export async function getPublishedTutorial(): Promise<TutorialFullData | null> {
  const supabase = createPublicReadClient();
  return readConfigTree(supabase, "published");
}

// ── Admin read ──

export async function getDraftTutorial(): Promise<TutorialFullData | null> {
  await requireAdminUser("/admin/tutorial");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");
  return readConfigTree(supabase, "draft");
}

export async function getAdminTutorialData(): Promise<{
  published: TutorialFullData | null;
  draft: TutorialFullData | null;
}> {
  await requireAdminUser("/admin/tutorial");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const [published, draft] = await Promise.all([
    readConfigTree(supabase, "published"),
    readConfigTree(supabase, "draft"),
  ]);

  return { published, draft };
}

// ── Save draft ──

export async function saveDraft(input: SaveDraftInput): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const parsed = saveDraftInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "保存数据无效");
  }

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { config, chapters } = parsed.data;

  // 1. Upsert draft config
  const { error: configError } = await supabase
    .from("tutorial_configs")
    .upsert(
      {
        id: "draft",
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
    .eq("config_id", "draft");

  if (deleteError) throw new Error(`清理旧草稿失败：${deleteError.message}`);

  // 3. Insert chapters with nested images and tools
  for (const chapter of chapters) {
    const { data: inserted, error: chapterError } = await supabase
      .from("tutorial_chapters")
      .insert({
        config_id: "draft",
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

export async function publishTutorial(): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  // 1. Read draft
  const draft = await readConfigTree(supabase, "draft");
  if (!draft) throw new Error("没有草稿可发布，请先编辑并保存。");

  // 2. Delete published config (cascade deletes chapters/images/tools)
  await supabase.from("tutorial_configs").delete().eq("id", "published");

  // 3. Insert published config
  const { error: pubError } = await supabase
    .from("tutorial_configs")
    .insert({
      id: "published",
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
        config_id: "published",
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

  // 5. Delete draft
  await supabase.from("tutorial_configs").delete().eq("id", "draft");

  revalidatePath("/guide");
  revalidatePath("/admin/tutorial");
}

// ── Discard draft ──

export async function discardDraft(): Promise<void> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const { error } = await supabase
    .from("tutorial_configs")
    .delete()
    .eq("id", "draft");

  if (error) throw new Error(`放弃草稿失败：${error.message}`);

  revalidatePath("/admin/tutorial");
}

// ── Migration from config.ts ──

export async function migrateFromConfig(): Promise<{ migrated: boolean; count: number }> {
  await requireAdminUser("/admin/tutorial");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  // Check if published already exists
  const { data: existing } = await supabase
    .from("tutorial_configs")
    .select("id")
    .eq("id", "published")
    .single();

  if (existing) {
    return { migrated: false, count: 0 };
  }

  // Insert published config
  await supabase.from("tutorial_configs").insert({
    id: "published",
    title: tutorialConfig.title,
    subtitle: tutorialConfig.subtitle,
    image_base_path: tutorialConfig.imageBasePath,
  });

  // Insert chapters with images and tools
  for (const chapter of tutorialConfig.chapters) {
    const { data: inserted, error: chError } = await supabase
      .from("tutorial_chapters")
      .insert({
        config_id: "published",
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
  const { data } = await supabase
    .from("tutorial_configs")
    .select("id")
    .eq("id", "published")
    .single();

  return !data;
}
