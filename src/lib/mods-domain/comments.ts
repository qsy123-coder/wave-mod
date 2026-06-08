import "server-only";

import { logger } from "@/lib/logger";
import { mapComment } from "@/lib/mods-domain/mappers";
import { isAbortErrorMessage, modIdSchema } from "@/lib/mods-domain/sorting";
import type { CommentRow, ModComment, ModCommentSort, PaginatedResult } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

type ReactionRow = { comment_id: string; user_id: string; value: number };

export async function getModComments(modId: string) {
  const paginated = await getModCommentsPage(modId, 1, 20, "newest");
  return paginated.items;
}

export function parseModCommentSort(value: string | null): ModCommentSort {
  if (value === "oldest" || value === "most-liked") return value;
  return "newest";
}

async function attachCommentCommunityData(comments: ModComment[], currentUserId: string | null) {
  if (!comments.length) return comments;

  const supabase = createPublicReadClient();
  const commentIds = comments.map((comment) => comment.id);
  const { data: reactions } = await supabase.from("comment_reactions").select("comment_id,user_id,value").in("comment_id", commentIds);
  const reactionRows = (reactions ?? []) as ReactionRow[];
  const reactionStats = new Map<string, { dislikes: number; likes: number; userReaction: 1 | -1 | null }>();

  for (const commentId of commentIds) reactionStats.set(commentId, { dislikes: 0, likes: 0, userReaction: null });
  for (const reaction of reactionRows) {
    const stat = reactionStats.get(reaction.comment_id);
    if (!stat) continue;
    if (reaction.value === 1) stat.likes += 1;
    if (reaction.value === -1) stat.dislikes += 1;
    if (currentUserId && reaction.user_id === currentUserId && (reaction.value === 1 || reaction.value === -1)) stat.userReaction = reaction.value;
  }

  const { data: replies } = await supabase
    .from("comments")
    .select(`
      id,
      content,
      created_at,
      is_pinned,
      parent_id,
      user_id,
      profiles (
        display_name,
        avatar_url,
        role
      )
    `)
    .in("parent_id", commentIds)
    .order("created_at", { ascending: true });

  const replyRows = ((replies ?? []) as CommentRow[]).map(mapComment);
  const repliesByParent = new Map<string, ModComment[]>();
  for (const reply of replyRows) {
    if (!reply.parentId) continue;
    repliesByParent.set(reply.parentId, [...(repliesByParent.get(reply.parentId) ?? []), reply]);
  }

  return comments.map((comment) => {
    const stat = reactionStats.get(comment.id);
    return {
      ...comment,
      dislikesCount: stat?.dislikes ?? 0,
      likesCount: stat?.likes ?? 0,
      replies: repliesByParent.get(comment.id) ?? [],
      userReaction: stat?.userReaction ?? null,
    };
  });
}

export async function getModCommentsPage(modId: string, page: number, pageSize: number, sort: ModCommentSort = "newest", currentUserId: string | null = null): Promise<PaginatedResult<ModComment>> {
  const parsedId = modIdSchema.safeParse(modId);

  if (!parsedId.success) {
    return { hasMore: false, items: [], nextPage: null, page: 1, pageSize };
  }

  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const supabase = createPublicReadClient();
  const ascending = sort === "oldest";
  const from = sort === "most-liked" ? 0 : (safePage - 1) * safePageSize;
  const to = sort === "most-liked" ? 499 : from + safePageSize - 1;

  const { data, error } = await supabase
    .from("comments")
    .select(`
      id,
      content,
      created_at,
      is_pinned,
      parent_id,
      user_id,
      profiles (
        display_name,
        avatar_url,
        role
      )
    `)
    .eq("mod_id", parsedId.data)
    .is("parent_id", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending })
    .range(from, to);

  if (error) {
    if (!isAbortErrorMessage(error.message)) logger.warn("[mods] getModCommentsPage failed, fallback to empty page", { error: error.message, sort });
    return { hasMore: false, items: [], nextPage: null, page: safePage, pageSize: safePageSize };
  }

  let items = await attachCommentCommunityData(((data ?? []) as CommentRow[]).map(mapComment), currentUserId);
  if (sort === "most-liked") {
    items = items.sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const start = (safePage - 1) * safePageSize;
    items = items.slice(start, start + safePageSize);
  }

  const hasMore = sort === "most-liked" ? (data ?? []).length > safePage * safePageSize : items.length === safePageSize;
  return { hasMore, items, nextPage: hasMore ? safePage + 1 : null, page: safePage, pageSize: safePageSize };
}
