import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export const modCacheTags = {
  characters: "mods:characters",
  detail: (id: string) => `mods:detail:${id}`,
  list: "mods:list",
} as const;

export function revalidatePublicModCaches(modId?: string) {
  revalidateTag(modCacheTags.characters, "default");
  revalidateTag(modCacheTags.list, "default");

  if (modId) {
    revalidateTag(modCacheTags.detail(modId), "default");
    revalidatePath(`/mods/${modId}`);
  }

  revalidatePath("/");
  revalidatePath("/mods");
}
