"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import type { UploadFormState } from "@/actions/admin/upload-actions";
import { getPersistedModMeta } from "@/constants/upload-defaults";
import {
  adminModUpdateFormSchema,
  buildAdminModFieldErrors,
  parseAdminModUpdateFormData,
  splitImageUrls,
  splitTags,
} from "@/lib/admin/mod-form";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { createAdminClient } from "@/lib/supabase/admin";

const modIdSchema = z.uuid("无效的 MOD ID。");

export async function updateModAction(_prevState: UploadFormState, formData: FormData): Promise<UploadFormState> {
  await requireAdminUser("/admin/mods");

  const parsed = adminModUpdateFormSchema.safeParse(parseAdminModUpdateFormData(formData));

  if (!parsed.success) {
    return { error: "请先修正表单中的红色报错项。", fieldErrors: buildAdminModFieldErrors(parsed.error), success: "" };
  }

  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) {
    return { error: "服务端缺少 Supabase Service Role Key，暂时无法更新 MOD。", fieldErrors: {}, success: "" };
  }

  const payload = parsed.data;
  const imageList = splitImageUrls(payload.imageUrls);
  const tagList = splitTags(payload.tags);
  const persistedMeta = getPersistedModMeta();

  if (imageList.length === 0) {
    return { error: "请至少提供一张预览图链接。", fieldErrors: { imageUrls: "请至少提供一张预览图链接。" }, success: "" };
  }

  const { error } = await supabaseAdmin
    .from("mods")
    .update({
      title: payload.title,
      character: payload.character,
      version: persistedMeta.version,
      game_version: persistedMeta.gameVersion,
      description: payload.description,
      download_url: payload.downloadUrl,
      video_url: payload.videoUrl || null,
      mod_author_url: payload.authorUrl || null,
      images: imageList,
      tags: tagList,
      nsfw: payload.nsfw,
      xxmi_install_guide: payload.xxmiGuide,
    })
    .eq("id", payload.id);

  if (error) {
    return { error: `更新失败：${error.message}`, fieldErrors: {}, success: "" };
  }

  revalidatePublicModCaches(payload.id);
  revalidatePath("/admin/mods");
  revalidatePath(`/admin/mods/${payload.id}/edit`);

  return { error: "", fieldErrors: {}, success: "MOD 信息已更新。" };
}

export async function getEditableMod(id: string) {
  await requireAdminUser("/admin/mods");

  const parsedId = modIdSchema.safeParse(id);
  if (!parsedId.success) return null;

  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("mods")
    .select(`
      id,
      title,
      character,
      version,
      game_version,
      description,
      images,
      video_url,
      download_url,
      tags,
      nsfw,
      mod_author_url,
      xxmi_install_guide,
      views,
      downloads_count,
      favorites_count,
      likes_count,
      comments_count,
      rating_count,
      rating_average,
      is_published,
      created_at
    `)
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error || !data) return null;

  return {
    character: data.character,
    commentsCount: data.comments_count ?? 0,
    coverImage: data.images?.[0] ?? "",
    createdAt: data.created_at,
    description: data.description,
    downloadUrl: data.download_url,
    downloads: data.downloads_count ?? 0,
    favorites: data.favorites_count ?? 0,
    gameVersion: data.game_version,
    id: data.id,
    images: data.images ?? [],
    isPublished: data.is_published,
    likes: data.likes_count ?? 0,
    modAuthorUrl: data.mod_author_url,
    nsfw: data.nsfw ?? false,
    ratingAverage: Number(data.rating_average ?? 0),
    ratingCount: data.rating_count ?? 0,
    tags: data.tags ?? [],
    title: data.title,
    userRating: null,
    version: data.version,
    videoUrl: data.video_url,
    views: data.views ?? 0,
    xxmiInstallGuide: data.xxmi_install_guide,
  };
}
