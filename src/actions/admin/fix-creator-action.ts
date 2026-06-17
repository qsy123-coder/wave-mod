"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { revalidateCreatorProfileCache } from "@/lib/mod-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export type FixCreatorResult = {
  fixed: number;
  error: string;
};

/** 批量补齐所有 created_by 为 NULL 的 MOD，关联到当前管理员用户 */
export async function fixMissingCreatedByAction(): Promise<FixCreatorResult> {
  await requireAdminUser("/admin/mods");

  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) {
    return { fixed: 0, error: "缺少 Supabase Service Role Key。" };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return { fixed: 0, error: "无法获取当前用户信息，请重新登录。" };
  }

  // 先查有多少 MOD 缺少 created_by
  const { data: nullMods, error: selectError } = await supabaseAdmin
    .from("mods")
    .select("id")
    .is("created_by", null);

  if (selectError) {
    return { fixed: 0, error: `查询失败：${selectError.message}` };
  }

  if (!nullMods || nullMods.length === 0) {
    return { fixed: 0, error: "" };
  }

  // 批量更新
  const { error: updateError } = await supabaseAdmin
    .from("mods")
    .update({ created_by: currentUser.id })
    .is("created_by", null);

  if (updateError) {
    return { fixed: 0, error: `更新失败：${updateError.message}` };
  }

  const count = nullMods.length;

  // 刷新缓存和页面
  revalidateCreatorProfileCache(currentUser.id);
  revalidatePath("/admin/mods");
  revalidatePath("/", "layout");

  return { fixed: count, error: "" };
}
