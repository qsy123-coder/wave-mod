import "server-only";

import { logger } from "@/lib/logger";
import { isMissingTableError, modIdSchema } from "@/lib/mods-domain/sorting";
import type { ViewerModState } from "@/lib/mods-domain/types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

function getEmptyViewerModState(): ViewerModState {
  return {
    isFavorited: false,
    isLiked: false,
    userRating: null,
  };
}

export async function getViewerModState(modId: string): Promise<ViewerModState> {
  const parsedId = modIdSchema.safeParse(modId);

  if (!parsedId.success) {
    return getEmptyViewerModState();
  }

  const user = await getCurrentUser();

  if (!user) {
    return getEmptyViewerModState();
  }

  const supabase = await createClient();
  const [favoriteResult, ratingResult, likeResult] = await Promise.all([
    supabase
      .from("favorites")
      .select("id")
      .eq("mod_id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("ratings")
      .select("score")
      .eq("mod_id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("likes")
      .select("id")
      .eq("mod_id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  let isFavorited = false;
  let isLiked = false;
  let userRating: number | null = null;

  if (favoriteResult.error) {
    logger.warn("[mods] getViewerModState favorite lookup failed", { error: favoriteResult.error.message });
  } else {
    isFavorited = Boolean(favoriteResult.data);
  }

  if (ratingResult.error) {
    logger.warn("[mods] getViewerModState rating lookup failed", { error: ratingResult.error.message });
  } else {
    userRating = ratingResult.data?.score ?? null;
  }

  if (likeResult.error) {
    if (isMissingTableError(likeResult.error.message)) {
      logger.warn("[mods] likes table is missing", { table: "likes" });
    } else {
      logger.warn("[mods] getViewerModState like lookup failed", { error: likeResult.error.message });
    }
  } else {
    isLiked = Boolean(likeResult.data);
  }

  return {
    isFavorited,
    isLiked,
    userRating,
  };
}
