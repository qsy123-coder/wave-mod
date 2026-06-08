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

const commentReactionSchema = z.object({
  commentId: z.uuid("无效的评论 ID。"),
  modId: z.uuid("无效的 MOD ID。"),
  value: z.coerce.number().pipe(z.union([z.literal(-1), z.literal(1)])),
});

const replyCommentSchema = z.object({
  content: z.string().trim().min(1, "回复内容不能为空。").max(1000, "回复内容不能超过 1000 字。"),
  modId: z.uuid("无效的 MOD ID。"),
  parentId: z.uuid("无效的评论 ID。"),
});

const pinCommentSchema = z.object({
  commentId: z.uuid("无效的评论 ID。"),
  isPinned: z.enum(["true", "false"]).transform((value) => value === "true"),
  modId: z.uuid("无效的 MOD ID。"),
});

type CommentProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  id: string | null;
  role: "admin" | "user" | "vip" | null;
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
      is_pinned,
      parent_id,
      user:profiles!comments_user_id_fkey (
        id,
        display_name,
        avatar_url,
        role
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
    isPinned: data.is_pinned,
    parentId: data.parent_id,
    replies: [],
    user: {
      avatarUrl: profile?.avatar_url ?? null,
      displayName: profile?.display_name ?? user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "我",
      id: profile?.id ?? user.id,
      role: profile?.role === "admin" ? "admin" : "user",
    },
  };
}

export async function replyCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("请先登录后再回复评论。");

  await ensureProfile();

  const parsed = replyCommentSchema.safeParse({
    content: String(formData.get("content") ?? ""),
    modId: String(formData.get("modId") ?? ""),
    parentId: String(formData.get("parentId") ?? ""),
  });

  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "回复参数无效。");

  const supabase = await createClient();
  const { content, modId, parentId } = parsed.data;
  const { data, error } = await supabase
    .from("comments")
    .insert({ content, mod_id: modId, parent_id: parentId, user_id: user.id })
    .select(`
      id,
      content,
      created_at,
      is_pinned,
      parent_id,
      user:profiles!comments_user_id_fkey (
        id,
        display_name,
        avatar_url,
        role
      )
    `)
    .single();

  if (error) throw new Error(`回复失败：${error.message}`);
  const profile = (Array.isArray(data.user) ? data.user[0] : data.user) as CommentProfileRow | null | undefined;

  await syncCommentCount(modId);
  revalidatePublicModCaches(modId);
  revalidatePath(`/mods/${modId}`);

  return {
    content: data.content,
    createdAt: data.created_at,
    id: data.id,
    isPinned: data.is_pinned,
    parentId: data.parent_id,
    replies: [],
    user: {
      avatarUrl: profile?.avatar_url ?? null,
      displayName: profile?.display_name ?? user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "我",
      id: profile?.id ?? user.id,
      role: profile?.role === "admin" ? "admin" : "user",
    },
  };
}

export async function toggleCommentReactionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("请先登录后再进行评价。");

  await ensureProfile();

  const parsed = commentReactionSchema.safeParse({
    commentId: String(formData.get("commentId") ?? ""),
    modId: String(formData.get("modId") ?? ""),
    value: String(formData.get("value") ?? ""),
  });

  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "评价参数无效。");

  const { commentId, modId, value } = parsed.data;
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase.from("comment_reactions").select("id,value").eq("comment_id", commentId).eq("user_id", user.id).maybeSingle();
  if (existingError) throw new Error(`读取评价失败：${existingError.message}`);

  if (existing?.value === value) {
    const { error } = await supabase.from("comment_reactions").delete().eq("id", existing.id).eq("user_id", user.id);
    if (error) throw new Error(`取消评价失败：${error.message}`);
  } else if (existing) {
    const { error } = await supabase.from("comment_reactions").update({ value }).eq("id", existing.id).eq("user_id", user.id);
    if (error) throw new Error(`更新评价失败：${error.message}`);
  } else {
    const { error } = await supabase.from("comment_reactions").insert({ comment_id: commentId, user_id: user.id, value });
    if (error) throw new Error(`提交评价失败：${error.message}`);
  }

  const { data: reactions, error: reactionsError } = await supabase.from("comment_reactions").select("value,user_id").eq("comment_id", commentId);
  if (reactionsError) throw new Error(`同步评价失败：${reactionsError.message}`);

  const likesCount = reactions?.filter((reaction) => reaction.value === 1).length ?? 0;
  const dislikesCount = reactions?.filter((reaction) => reaction.value === -1).length ?? 0;
  const userReaction = reactions?.find((reaction) => reaction.user_id === user.id)?.value ?? null;

  revalidatePublicModCaches(modId);
  revalidatePath(`/mods/${modId}`);

  return { commentId, dislikesCount, likesCount, userReaction: userReaction === 1 || userReaction === -1 ? userReaction : null };
}

export async function togglePinCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("请先登录后再操作评论。");

  const admin = await isAdminUser();
  if (!admin) throw new Error("只有管理员可以置顶评论。");

  const parsed = pinCommentSchema.safeParse({
    commentId: String(formData.get("commentId") ?? ""),
    isPinned: String(formData.get("isPinned") ?? "false"),
    modId: String(formData.get("modId") ?? ""),
  });

  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "置顶参数无效。");

  const { commentId, isPinned, modId } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("comments").update({ is_pinned: isPinned }).eq("id", commentId).eq("mod_id", modId).is("parent_id", null);
  if (error) throw new Error(`更新置顶失败：${error.message}`);

  revalidatePublicModCaches(modId);
  revalidatePath(`/mods/${modId}`);

  return { commentId, isPinned };
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
