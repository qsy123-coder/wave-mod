import { z } from "zod";

import type { ModSort, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";

export const modIdSchema = z.uuid();
export const modSortSchema = z.enum(["latest", "favorites", "rating", "hot"]);

export function calculateHotScore(mod: Pick<SiteMod, "views" | "downloads" | "favorites" | "likes" | "commentsCount" | "ratingCount" | "ratingAverage">) {
  return mod.views * 0.08 + mod.downloads * 5 + mod.favorites * 4 + mod.likes * 3 + mod.commentsCount * 5 + mod.ratingCount * 2 + mod.ratingAverage * 18;
}

export function applyModSort(sort: Exclude<ModSort, "hot">) {
  return (mods: SiteMod[]) => {
    if (sort === "favorites") {
      return mods
        .slice()
        .sort((a, b) => b.favorites - a.favorites || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    if (sort === "rating") {
      return mods
        .slice()
        .sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    return mods.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  };
}

export function sortModsByHot(mods: SiteMod[]) {
  return mods
    .slice()
    .sort((a, b) => calculateHotScore(b) - calculateHotScore(a) || b.ratingAverage - a.ratingAverage || b.views - a.views || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function applyModQueryFilters(mods: SiteMod[], filters: Pick<PublicModsFilters, "character" | "query">) {
  let nextMods = mods;

  if (filters.character) {
    nextMods = nextMods.filter((mod) => mod.character === filters.character);
  }

  const normalizedQuery = filters.query
    ?.split(/[,，\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedQuery && normalizedQuery.length > 0) {
    nextMods = nextMods.filter((mod) => {
      const haystack = [mod.title, mod.character, mod.description, ...mod.tags].join(" ").toLowerCase();
      return normalizedQuery.every((keyword) => haystack.includes(keyword));
    });
  }

  return nextMods;
}

export function parseModSort(sort: string | undefined): ModSort {
  return modSortSchema.safeParse(sort).data ?? "latest";
}

export function parseCharacterFilter(character: string | undefined) {
  const value = character?.trim();
  return value ? value : undefined;
}

export function parseModQuery(query: string | undefined) {
  const value = query?.trim();
  return value ? value : undefined;
}

export function normalizeCharacterName(value: string) {
  return value.trim();
}

export function isMissingTableError(message: string) {
  return message.includes("Could not find the table 'public.likes'") || message.includes("relation \"public.likes\" does not exist");
}

export function isAbortErrorMessage(message: string) {
  return message.toLowerCase().includes("aborterror") || message.toLowerCase().includes("operation was aborted");
}
