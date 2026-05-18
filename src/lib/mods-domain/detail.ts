import "server-only";

import { getPublicModBaseById } from "@/lib/mods-domain/public";
import { getViewerModState } from "@/lib/mods-domain/viewer";

export async function getPublicModById(id: string) {
  const mod = await getPublicModBaseById(id);

  if (!mod) {
    return null;
  }

  const viewerState = await getViewerModState(id);

  return {
    ...mod,
    ...viewerState,
  };
}
