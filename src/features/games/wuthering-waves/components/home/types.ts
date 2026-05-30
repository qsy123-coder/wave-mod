import type { SiteMod } from "@/lib/mods-domain/types";

export type HomePageData = {
  featuredMods: SiteMod[];
  latestMods: SiteMod[];
  topRatedMods: SiteMod[];
};

export type WutheringWavesHomePageProps = {
  data: HomePageData;
};
