import "server-only";

import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { AdminMod, ModRow } from "@/lib/mods-domain/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getAdminMods() {
  const supabase = createAdminClient();

  if (!supabase) {
    logger.error("[mods] getAdminMods missing admin client");
    return [] satisfies AdminMod[];
  }

  const { data, error } = await supabase
    .from("mods")
    .select(publicModColumns)
    .order("created_at", { ascending: false });

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
