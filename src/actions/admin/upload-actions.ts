"use server";

import { revalidatePath } from "next/cache";

import { getPersistedModMeta } from "@/constants/upload-defaults";
import {
  adminModFormSchema,
  buildAdminModFieldErrors,
  parseAdminModFormData,
  splitDriveLinks,
  splitImageUrls,
  type AdminModFormState,
} from "@/lib/admin/mod-form";
import { execute } from "@/lib/db/query";
import { revalidatePublicModCaches } from "@/lib/mod-cache";

export type UploadFormState = AdminModFormState;

export async function createModAction(_prevState: UploadFormState, formData: FormData): Promise<UploadFormState> {

  const parsed = adminModFormSchema.safeParse(parseAdminModFormData(formData));

  if (!parsed.success) {
    return {
      error: "请先修正表单中的红色报错项。",
      fieldErrors: buildAdminModFieldErrors(parsed.error),
      success: "",
    };
  }

  const payload = parsed.data;
  const imageList = splitImageUrls(payload.imageUrls);
  const persistedMeta = getPersistedModMeta();

  if (imageList.length === 0) {
    return {
      error: "请至少提供一张预览图链接。",
      fieldErrors: { imageUrls: "请至少提供一张预览图链接。" },
      success: "",
    };
  }

  try {
    // 登录已下线，created_by 留空（列可空）；历史数据里的 created_by 原样保留。
    // drive_links 是 jsonb：对象数组必须显式 JSON.stringify，否则 pg 会按 Postgres 数组编码。
    await execute(
      `insert into public.mods
         (title, game_key, character, version, game_version, description,
          download_url, video_url, mod_author_url, images, drive_links, nsfw, xxmi_install_guide)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
      ],
    );
  } catch (error) {
    return {
      error: `写入数据库失败：${error instanceof Error ? error.message : "未知错误"}`,
      fieldErrors: {},
      success: "",
    };
  }

  revalidatePublicModCaches();
  revalidatePath("/mods");
  revalidatePath(`/${payload.gameKey}`);
  revalidatePath(`/${payload.gameKey}/mods`);
  revalidatePath(`/${payload.gameKey}/profile`);
  revalidatePath("/admin/mods");

  return {
    error: "",
    fieldErrors: {},
    success: "MOD 已成功写入数据库。",
  };
}
