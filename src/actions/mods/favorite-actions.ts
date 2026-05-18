"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { createClient, ensureProfile, getCurrentUser } from "@/lib/supabase/server";

const favoriteSchema = z.object({
  id: z.uuid("无效的 MOD ID。"),
});

async function syncFavoriteCount(modId: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("服务端缺少 Supabase Service Role Key，暂时无法同步收藏计数。");
  }

  const { count, error: countError } = await supabaseAdmin
    .from("favorites")
    .select("id", { count: "exact", head: true })
    .eq("mod_id", modId);

  if (countError) {
    throw new Error(`读取收藏计数失败：${countError.message}`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("mods")
    .update({ favorites_count: count ?? 0 })
    .eq("id", modId);

  if (updateError) {
    throw new Error(`更新收藏计数失败：${updateError.message}`);
  }
}

export async function toggleFavoriteAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("请先登录后再收藏 MOD。");
  }

  await ensureProfile();

  const parsed = favoriteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "收藏参数无效。");
  }

  const supabase = await createClient();
  const modId = parsed.data.id;
  const userId = user.id;

  const { data: existingFavorite, error: existingError } = await supabase
    .from("favorites")
    .select("id")
    .eq("mod_id", modId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`读取收藏状态失败：${existingError.message}`);
  }

  if (existingFavorite) {
    const { error: deleteError } = await supabase
      .from("favorites")
      .delete()
      .eq("mod_id", modId)
      .eq("user_id", userId);

    if (deleteError) {
      throw new Error(`取消收藏失败：${deleteError.message}`);
    }
  } else {
    const { error: insertError } = await supabase.from("favorites").insert({
      mod_id: modId,
      user_id: userId,
    });

    if (insertError) {
      if (insertError.message.includes("favorites_user_id_fkey")) {
        throw new Error("当前账号还没有对应的 profiles 记录。请先在数据库里为该用户创建 profile，或调整 favorites.user_id 外键指向 auth.users。");
      }

      throw new Error(`收藏失败：${insertError.message}`);
    }
  }

  await syncFavoriteCount(modId);

  revalidatePublicModCaches(modId);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/favorites");
}
