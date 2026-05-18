"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { createClient, ensureProfile, getCurrentUser } from "@/lib/supabase/server";

const modSchema = z.object({
  modId: z.uuid("无效的 MOD ID。"),
});

function isMissingTableError(message: string) {
  return message.includes("Could not find the table 'public.likes'") || message.includes("relation \"public.likes\" does not exist");
}

async function syncLikeCount(modId: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("服务端缺少 Supabase Service Role Key，暂时无法同步点赞计数。");
  }

  const { count, error: countError } = await supabaseAdmin
    .from("likes")
    .select("id", { count: "exact", head: true })
    .eq("mod_id", modId);

  if (countError) {
    if (isMissingTableError(countError.message)) {
      throw new Error("数据库还没有 likes 表，请先执行 supabase/add_likes.sql。");
    }

    throw new Error(`读取点赞计数失败：${countError.message}`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("mods")
    .update({ likes_count: count ?? 0 })
    .eq("id", modId);

  if (updateError) {
    throw new Error(`更新点赞计数失败：${updateError.message}`);
  }
}

export async function toggleLikeAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("请先登录后再点赞。");
  }

  await ensureProfile();

  const parsed = modSchema.safeParse({
    modId: String(formData.get("modId") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "点赞参数无效。");
  }

  const supabase = await createClient();
  const modId = parsed.data.modId;

  const { data: existingLike, error: existingError } = await supabase
    .from("likes")
    .select("id")
    .eq("mod_id", modId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError.message)) {
      throw new Error("数据库还没有 likes 表，请先执行 supabase/add_likes.sql。");
    }

    throw new Error(`读取点赞状态失败：${existingError.message}`);
  }

  if (existingLike) {
    const { error: deleteError } = await supabase
      .from("likes")
      .delete()
      .eq("mod_id", modId)
      .eq("user_id", user.id);

    if (deleteError) {
      throw new Error(`取消点赞失败：${deleteError.message}`);
    }
  } else {
    const { error: insertError } = await supabase.from("likes").insert({
      mod_id: modId,
      user_id: user.id,
    });

    if (insertError) {
      if (isMissingTableError(insertError.message)) {
        throw new Error("数据库还没有 likes 表，请先执行 supabase/add_likes.sql。");
      }

      throw new Error(`点赞失败：${insertError.message}`);
    }
  }

  await syncLikeCount(modId);

  revalidatePublicModCaches(modId);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/favorites");
}
