"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { zLayoutStyle, type LayoutStyle } from "@/lib/layout-style/constants";
import { logger } from "@/lib/logger";

const updateProfileSchema = z.object({
  displayName: z.string().min(1, "名字不能为空").max(32, "名字最多 32 个字符"),
  bio: z.string().max(200, "简介最多 200 个字符").optional(),
});

export type UpdateProfileState = { error: string; success: string };

export async function updateProfileAction(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "请先登录。", success: "" };

  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio") || undefined,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("；");
    return { error: msg, success: "" };
  }

  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) return { error: "服务端配置缺失，请联系管理员。", success: "" };

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ display_name: parsed.data.displayName.trim(), bio: parsed.data.bio?.trim() || null })
    .eq("id", currentUser.id);

  if (error) return { error: `更新失败：${error.message}`, success: "" };

  revalidateTag(`creator:profile:${currentUser.id}`, "default");
  return { error: "", success: "个人资料已更新。" };
}

/** 将用户视觉风格偏好同步到 Supabase profiles 表 */
export async function syncLayoutStyleAction(layoutStyle: LayoutStyle): Promise<void> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    const supabaseAdmin = createAdminClient();
    if (!supabaseAdmin) return;

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: currentUser.id, layout_style: layoutStyle }, { onConflict: "id" });

    if (error) logger.warn("[layout-style] Supabase sync failed", { error: error.message, userId: currentUser.id });
  } catch (e) {
    logger.warn("[layout-style] Supabase sync exception", { error: e instanceof Error ? e.message : "unknown" });
  }
}

/** 从 Supabase profiles 读取用户视觉风格偏好 */
export async function getRemoteLayoutStyleAction(): Promise<LayoutStyle | null> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const supabaseAdmin = createAdminClient();
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("layout_style")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error || !data?.layout_style) return null;
    const parsed = zLayoutStyle.safeParse(data.layout_style);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
