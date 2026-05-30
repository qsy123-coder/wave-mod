import "server-only";

import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { AdminMod, ModRow, PublicModsFilters } from "@/lib/mods-domain/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getAdminMods(gameKey?: PublicModsFilters["gameKey"]) {
  const supabase = createAdminClient();

  if (!supabase) {
    logger.error("[mods] getAdminMods missing admin client");
    return [] satisfies AdminMod[];
  }

  let query = supabase
    .from("mods")
    .select(publicModColumns);

  if (gameKey) {
    query = query.eq("game_key", gameKey);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    logger.error("[mods] getAdminMods failed", { error: error.message });
    return [] satisfies AdminMod[];
  }

  return (data ?? []).map((row) => {
    const typedRow = row as ModRow;
    return {
      ...mapMod(typedRow),
      isPublished: typedRow.is_published,
    } satisfies AdminMod;
  });
}
