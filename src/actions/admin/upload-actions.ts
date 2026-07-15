"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { getPersistedModMeta } from "@/constants/upload-defaults";
import {
  adminModFormSchema,
  buildAdminModFieldErrors,
  parseAdminModFormData,
  splitDriveLinks,
  splitImageUrls,
  type AdminModFormState,
} from "@/lib/admin/mod-form";
import { revalidateCreatorProfileCache, revalidatePublicModCaches } from "@/lib/mod-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServerSupabaseEnv } from "@/lib/supabase/server-config";

export type UploadFormState = AdminModFormState;

export async function createModAction(_prevState: UploadFormState, formData: FormData): Promise<UploadFormState> {
  await requireAdminUser("/admin/upload");

  const env = getServerSupabaseEnv();
  const supabaseAdmin = createAdminClient();

  if (!env?.serviceRoleKey || !supabaseAdmin) {
    return {
      error: "服务端缺少 Supabase Service Role Key，暂时无法写入数据库。",
      fieldErrors: {},
      success: "",
    };
  }

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

  // 关联当前上传者
  const currentUser = await getCurrentUser();
  const createdBy = currentUser?.id ?? null;

  const { error } = await supabaseAdmin.from("mods").insert({
    title: payload.title,
    game_key: payload.gameKey,
    character: payload.character,
    version: persistedMeta.version,
    game_version: persistedMeta.gameVersion,
    description: payload.description,
    download_url: payload.downloadUrl || null,
    video_url: payload.videoUrl || null,
    mod_author_url: payload.authorUrl || null,
    images: imageList,
    drive_links: splitDriveLinks(payload.driveLinksText),
    nsfw: payload.nsfw,
    xxmi_install_guide: payload.xxmiGuide,
    created_by: createdBy,
  });

  if (error) {
    return {
      error:
        error.message === "Invalid API key"
          ? `写入数据库失败：Invalid API key（服务端当前读取到的是 ${env.serviceRoleKey.startsWith("sb_secret_") ? "sb_secret" : env.serviceRoleKey.startsWith("eyJ") ? "legacy_jwt" : "unknown"}，长度 ${env.serviceRoleKey.length}）`
          : `写入数据库失败：${error.message}`,
      fieldErrors: {},
      success: "",
    };
  }

  revalidatePublicModCaches();
  if (createdBy) {
    revalidateCreatorProfileCache(createdBy);
  }
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
