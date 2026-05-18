"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { createAdminClient } from "@/lib/supabase/admin";

const deleteModSchema = z.object({
  id: z.uuid("无效的 MOD ID。"),
});

const togglePublishSchema = z.object({
  id: z.uuid("无效的 MOD ID。"),
  isPublished: z.boolean(),
});

export async function deleteModAction(formData: FormData) {
  await requireAdminUser("/admin/mods");

  const parsed = deleteModSchema.safeParse({
    id: String(formData.get("id") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "删除参数无效。");
  }

  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("服务端缺少 Supabase Service Role Key，暂时无法删除 MOD。");
  }

  const { error } = await supabaseAdmin.from("mods").delete().eq("id", parsed.data.id);

  if (error) {
    throw new Error(`删除失败：${error.message}`);
  }

  revalidatePublicModCaches(parsed.data.id);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath(`/mods/${parsed.data.id}`);
  revalidatePath("/admin/mods");
}

export async function togglePublishAction(formData: FormData) {
  await requireAdminUser("/admin/mods");

  const parsed = togglePublishSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    isPublished: String(formData.get("isPublished") ?? "") === "true",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "发布状态参数无效。");
  }

  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("服务端缺少 Supabase Service Role Key，暂时无法切换发布状态。");
  }

  const { error } = await supabaseAdmin
    .from("mods")
    .update({ is_published: parsed.data.isPublished })
    .eq("id", parsed.data.id);

  if (error) {
    throw new Error(`状态切换失败：${error.message}`);
  }

  revalidatePublicModCaches(parsed.data.id);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath(`/mods/${parsed.data.id}`);
  revalidatePath("/admin/mods");
  revalidatePath(`/admin/mods/${parsed.data.id}/edit`);
}
