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
  revalidateTag("creators:ranking", "default");

  if (modId) {
    revalidateTag(modCacheTags.detail(modId), "default");
    revalidatePath(`/mods/${modId}`);
  }

  revalidatePath("/");
  revalidatePath("/mods");
}

/** 刷新指定创作者的 Profile 页缓存（上传/编辑 MOD 后调用） */
export function revalidateCreatorProfileCache(userId: string) {
  revalidateTag(`creator:profile:${userId}`, "default");
}
