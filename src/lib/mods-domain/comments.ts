import "server-only";

import { logger } from "@/lib/logger";
import { mapComment } from "@/lib/mods-domain/mappers";
import { isAbortErrorMessage, modIdSchema } from "@/lib/mods-domain/sorting";
import type { CommentRow, ModComment, ModCommentSort, PaginatedResult } from "@/lib/mods-domain/types";
import { createPublicReadClient } from "@/lib/supabase/server";

export async function getModComments(modId: string) {
  const paginated = await getModCommentsPage(modId, 1, 20, "newest");
  return paginated.items;
}

export function parseModCommentSort(value: string | null): ModCommentSort {
  if (value === "oldest" || value === "most-liked") return value;
  return "newest";
}

export async function getModCommentsPage(modId: string, page: number, pageSize: number, sort: ModCommentSort = "newest"): Promise<PaginatedResult<ModComment>> {
  const parsedId = modIdSchema.safeParse(modId);

  if (!parsedId.success) {
    return {
      hasMore: false,
      items: [],
      nextPage: null,
      page: 1,
      pageSize,
    };
  }

  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const supabase = createPublicReadClient();
  const ascending = sort === "oldest";
  const { data, error } = await supabase
    .from("comments")
    .select(`
      id,
      content,
      created_at,
      user_id,
      profiles (
        display_name,
        avatar_url
      )
    `)
    .eq("mod_id", parsedId.data)
    .order("created_at", { ascending })
    .range(from, to);

  if (error) {
    if (!isAbortErrorMessage(error.message)) {
      logger.warn("[mods] getModCommentsPage failed, fallback to empty page", { error: error.message, sort });
    }

    return {
      hasMore: false,
      items: [],
      nextPage: null,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  const items = (data ?? []).map((row) => mapComment(row as CommentRow));
  const hasMore = items.length === safePageSize;

  return {
    hasMore,
    items,
    nextPage: hasMore ? safePage + 1 : null,
    page: safePage,
    pageSize: safePageSize,
  };
}
