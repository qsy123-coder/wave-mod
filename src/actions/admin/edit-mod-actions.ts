"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { UploadFormState } from "@/actions/admin/upload-actions";
import { getPersistedModMeta } from "@/constants/upload-defaults";
import {
  adminModUpdateFormSchema,
  buildAdminModFieldErrors,
  parseAdminModUpdateFormData,
  splitDriveLinks,
  splitImageUrls,
} from "@/lib/admin/mod-form";
import { execute, queryOne } from "@/lib/db/query";
import { revalidatePublicModCaches } from "@/lib/mod-cache";

const modIdSchema = z.uuid("无效的 MOD ID。");

export async function updateModAction(_prevState: UploadFormState, formData: FormData): Promise<UploadFormState> {

  const parsed = adminModUpdateFormSchema.safeParse(parseAdminModUpdateFormData(formData));

  if (!parsed.success) {
    return { error: "请先修正表单中的红色报错项。", fieldErrors: buildAdminModFieldErrors(parsed.error), success: "" };
  }

  const payload = parsed.data;
  const imageList = splitImageUrls(payload.imageUrls);
  const persistedMeta = getPersistedModMeta();

  if (imageList.length === 0) {
    return { error: "请至少提供一张预览图链接。", fieldErrors: { imageUrls: "请至少提供一张预览图链接。" }, success: "" };
  }

  try {
    // created_by 由上传/历史数据决定，编辑时不再改写（登录已下线，没有「当前编辑者」）。
    await execute(
      `update public.mods set
         title = $1,
         game_key = $2,
         character = $3,
         version = $4,
         game_version = $5,
         description = $6,
         download_url = $7,
         video_url = $8,
         mod_author_url = $9,
         images = $10,
         drive_links = $11,
         nsfw = $12,
         xxmi_install_guide = $13
       where id = $14`,
      [
        payload.title,
        payload.gameKey,
        payload.character,
        persistedMeta.version,
        persistedMeta.gameVersion,
        payload.description,
        payload.downloadUrl || null,
        payload.videoUrl || null,
        payload.authorUrl || null,
        imageList,
        JSON.stringify(splitDriveLinks(payload.driveLinksText)),
        payload.nsfw,
        payload.xxmiGuide,
        payload.id,
      ],
    );
  } catch (error) {
    return {
      error: `更新失败：${error instanceof Error ? error.message : "未知错误"}`,
      fieldErrors: {},
      success: "",
    };
  }

  revalidatePublicModCaches(payload.id);
  revalidatePath("/admin/mods");
  revalidatePath(`/${payload.gameKey}`);
  revalidatePath(`/${payload.gameKey}/mods`);
  revalidatePath(`/${payload.gameKey}/mods/${payload.id}`);
  revalidatePath(`/${payload.gameKey}/profile`);
  revalidatePath(`/admin/mods/${payload.id}/edit`);

  return { error: "", fieldErrors: {}, success: "MOD 信息已更新。" };
}

export async function getEditableMod(id: string) {

  const parsedId = modIdSchema.safeParse(id);
  if (!parsedId.success) return null;

  const data = await queryOne<{
    id: string;
    title: string;
    character: string;
    version: string;
    game_version: string;
    game_key: string;
    description: string;
    images: string[] | null;
    video_url: string | null;
    download_url: string | null;
    drive_links: unknown;
    nsfw: boolean | null;
    mod_author_url: string | null;
    xxmi_install_guide: string;
    views: number | null;
    downloads_count: number | null;
    favorites_count: number | null;
    likes_count: number | null;
    comments_count: number | null;
    rating_count: number | null;
    rating_average: number | null;
    is_published: boolean;
    is_featured: boolean | null;
    created_at: string;
  }>(
    `select id, title, character, version, game_version, game_key, description,
            images, video_url, download_url, drive_links, nsfw, mod_author_url,
            xxmi_install_guide, views, downloads_count, favorites_count, likes_count,
            comments_count, rating_count, rating_average, is_published, is_featured, created_at
       from public.mods
      where id = $1`,
    [parsedId.data],
  );

  if (!data) return null;

  return {
    character: data.character,
    commentsCount: data.comments_count ?? 0,
    coverImage: data.images?.[0] ?? "",
    createdAt: data.created_at,
    description: data.description,
    downloadUrl: data.download_url,
    downloads: data.downloads_count ?? 0,
    driveLinks: (data.drive_links as Array<{ platform: string; url: string }>) ?? [],
    favorites: data.favorites_count ?? 0,
    gameKey: data.game_key,
    gameVersion: data.game_version,
    id: data.id,
    images: data.images ?? [],
    isFeatured: data.is_featured ?? false,
    isPublished: data.is_published,
    likes: data.likes_count ?? 0,
    modAuthorUrl: data.mod_author_url,
    nsfw: data.nsfw ?? false,
    ratingAverage: Number(data.rating_average ?? 0),
    ratingCount: data.rating_count ?? 0,
    title: data.title,
    userRating: null,
    version: data.version,
    videoUrl: data.video_url,
    views: data.views ?? 0,
    xxmiInstallGuide: data.xxmi_install_guide,
  };
}
