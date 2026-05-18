"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { createClient, ensureProfile, getCurrentUser, isAdminUser } from "@/lib/supabase/server";

const commentSchema = z.object({
  id: z.uuid("无效的 MOD ID。"),
  content: z.string().trim().min(1, "评论内容不能为空。").max(1000, "评论内容不能超过 1000 字。"),
});

const deleteCommentSchema = z.object({
  commentId: z.uuid("无效的评论 ID。"),
  modId: z.uuid("无效的 MOD ID。"),
});

type CommentProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  id: string | null;
};

async function syncCommentCount(modId: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("服务端缺少 Supabase Service Role Key，暂时无法同步评论计数。");
  }

  const { count, error: countError } = await supabaseAdmin.from("comments").select("id", { count: "exact", head: true }).eq("mod_id", modId);
  if (countError) throw new Error(`读取评论计数失败：${countError.message}`);

  const { error: updateError } = await supabaseAdmin.from("mods").update({ comments_count: count ?? 0 }).eq("id", modId);
  if (updateError) throw new Error(`更新评论计数失败：${updateError.message}`);
}

export async function createCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("请先登录后再发表评论。");

  await ensureProfile();

  const parsed = commentSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    content: String(formData.get("content") ?? ""),
  });

  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "评论参数无效。");

  const supabase = await createClient();
  const modId = parsed.data.id;

  const { data, error } = await supabase
    .from("comments")
    .insert({ mod_id: modId, user_id: user.id, content: parsed.data.content })
    .select(`
      id,
      content,
      created_at,
      user:profiles!comments_user_id_fkey (
        id,
        display_name,
        avatar_url
      )
    `)
    .single();

  if (error) {
    if (error.message.includes("comments_user_id_fkey")) {
      throw new Error("当前账号还没有对应的 profiles 记录，请先执行 profiles 回填脚本后再试。");
    }

    throw new Error(`发表评论失败：${error.message}`);
  }

  const profile = (Array.isArray(data.user) ? data.user[0] : data.user) as CommentProfileRow | null | undefined;

  await syncCommentCount(modId);
  revalidatePublicModCaches(modId);
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/");
  revalidatePath("/mods");

  return {
    content: data.content,
    createdAt: data.created_at,
    id: data.id,
    user: {
      avatarUrl: profile?.avatar_url ?? null,
      displayName: profile?.display_name ?? user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "我",
      id: profile?.id ?? user.id,
    },
  };
}

export async function deleteCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("请先登录后再删除评论。");

  const parsed = deleteCommentSchema.safeParse({
    commentId: String(formData.get("commentId") ?? ""),
    modId: String(formData.get("modId") ?? ""),
  });

  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "删除参数无效。");

  const { commentId, modId } = parsed.data;
  const supabase = await createClient();
  const admin = await isAdminUser();

  const { data: comment, error: commentError } = await supabase.from("comments").select("id, user_id").eq("id", commentId).eq("mod_id", modId).maybeSingle();
  if (commentError) throw new Error(`读取评论失败：${commentError.message}`);
  if (!comment) throw new Error("这条评论不存在或已经被删除。");
  if (!admin && comment.user_id !== user.id) throw new Error("你只能删除自己的评论。");

  const deleteQuery = supabase.from("comments").delete().eq("id", commentId).eq("mod_id", modId);
  const { error: deleteError } = admin ? await deleteQuery : await deleteQuery.eq("user_id", user.id);
  if (deleteError) throw new Error(`删除评论失败：${deleteError.message}`);

  await syncCommentCount(modId);
  revalidatePublicModCaches(modId);
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/");
  revalidatePath("/mods");

  return { commentId };
}
