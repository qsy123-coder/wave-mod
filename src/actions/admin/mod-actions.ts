"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { execute } from "@/lib/db/query";
import { revalidatePublicModCaches } from "@/lib/mod-cache";

const deleteModSchema = z.object({
  id: z.uuid("无效的 MOD ID。"),
});

const togglePublishSchema = z.object({
  id: z.uuid("无效的 MOD ID。"),
  isPublished: z.boolean(),
});

export async function deleteModAction(formData: FormData) {

  const parsed = deleteModSchema.safeParse({
    id: String(formData.get("id") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "删除参数无效。");
  }

  try {
    await execute("delete from public.mods where id = $1", [parsed.data.id]);
  } catch (error) {
    throw new Error(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePublicModCaches(parsed.data.id);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath(`/mods/${parsed.data.id}`);
  revalidatePath("/admin/mods");
}

export async function togglePublishAction(formData: FormData) {

  const parsed = togglePublishSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    isPublished: String(formData.get("isPublished") ?? "") === "true",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "发布状态参数无效。");
  }

  try {
    await execute("update public.mods set is_published = $1 where id = $2", [
      parsed.data.isPublished,
      parsed.data.id,
    ]);
  } catch (error) {
    throw new Error(`状态切换失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  revalidatePublicModCaches(parsed.data.id);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath(`/mods/${parsed.data.id}`);
  revalidatePath("/admin/mods");
  revalidatePath(`/admin/mods/${parsed.data.id}/edit`);
}
