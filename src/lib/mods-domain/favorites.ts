import "server-only";

import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { FavoriteMod, FavoriteRow, ModRow } from "@/lib/mods-domain/types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function getFavoriteMods() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data: favorites, error: favoritesError } = await supabase
    .from("favorites")
    .select("created_at, mod_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (favoritesError) {
    logger.warn("[mods] getFavoriteMods favorites lookup failed", { error: favoritesError.message });
    return [] satisfies FavoriteMod[];
  }

  const favoriteRows = (favorites ?? []) as FavoriteRow[];
  const modIds = favoriteRows.map((row) => row.mod_id);

  if (modIds.length === 0) {
    return [] satisfies FavoriteMod[];
  }

  const { data: mods, error: modsError } = await supabase
    .from("mods")
    .select(publicModColumns)
    .in("id", modIds)
    .eq("is_published", true);

  if (modsError) {
    logger.warn("[mods] getFavoriteMods mods lookup failed", { error: modsError.message });
    return [] satisfies FavoriteMod[];
  }

  const modMap = new Map((mods ?? []).map((row) => [row.id as string, row as ModRow]));

  return favoriteRows
    .map((row) => {
      const mod = modMap.get(row.mod_id);

      if (!mod) {
        return null;
      }

      return {
        ...mapMod(mod),
        favoritedAt: row.created_at,
        isFavorited: true,
      } satisfies FavoriteMod;
    })
    .filter(Boolean) as FavoriteMod[];
}
